// Development agent runtime: context assembly, tool execution against GitHub,
// key failover with checkpoints, verification-based auditing and resume.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { decryptSecret, redactSecrets } from "./crypto.server";
import * as GH from "./github.server";
import { AIError, callBuiltin, callGemini, pingGemini, type ChatMsg, type ToolCall, type ToolDef } from "./ai.server";
import { pickNextKey, normalizeProject, type KeyCandidate } from "./key-rotation";

type DB = SupabaseClient<Database>;
type RepoRow = Database["public"]["Tables"]["repositories"]["Row"];
type ChatRow = Database["public"]["Tables"]["chats"]["Row"];

const MAX_STEPS = 12;
const IGNORE = /(^|\/)(node_modules|\.git|dist|build|\.next|coverage|vendor)\//;

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

const j = (v: unknown) => v as Json;

export async function loadGithubToken(userId: string): Promise<{ token: string; connectionId: string } | null> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("api_connections")
    .select("id, secret_ciphertext")
    .eq("user_id", userId)
    .eq("provider", "github")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { token: await decryptSecret(data.secret_ciphertext), connectionId: data.id };
}

export type GeminiKeyRow = KeyCandidate & { model: string | null; secret_ciphertext: string };

export async function loadGeminiKeys(userId: string): Promise<GeminiKeyRow[]> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("api_connections")
    .select("id, name, google_project, is_primary, is_active, status, quota_exceeded_at, created_at, model, secret_ciphertext")
    .eq("user_id", userId)
    .eq("provider", "gemini");
  if (error) throw new Error(error.message);
  return (data ?? []) as GeminiKeyRow[];
}

async function markKey(id: string, patch: Database["public"]["Tables"]["api_connections"]["Update"]) {
  const admin = await getAdmin();
  await admin.from("api_connections").update(patch).eq("id", id);
}

// ---------------------------------------------------------------- context

export type ContextStats = {
  memory: number;
  audits: number;
  pendingTasks: number;
  openCheckpoints: number;
  files: number;
  headSha: string | null;
  repoError: string | null;
};

export async function buildProjectContext(
  db: DB,
  opts: { projectId: string; repo: RepoRow | null; branch: string | null; token: string | null },
) {
  const [project, memory, audits, tasks, checkpoints, changes] = await Promise.all([
    db.from("projects").select("name, description, context_summary").eq("id", opts.projectId).single(),
    db.from("project_memory").select("kind, title, content, created_at").eq("project_id", opts.projectId).order("created_at", { ascending: false }).limit(25),
    db.from("audit_logs").select("operation, file_path, status, result, commit_sha, created_at").eq("project_id", opts.projectId).order("created_at", { ascending: false }).limit(12),
    db.from("development_tasks").select("id, title, status, description").eq("project_id", opts.projectId).in("status", ["pending", "in_progress", "awaiting_approval", "failed"]).order("created_at").limit(30),
    db.from("checkpoints").select("id, reason, last_operation, created_at").eq("project_id", opts.projectId).eq("status", "open").order("created_at", { ascending: false }).limit(5),
    db.from("file_changes").select("file_path, change_type, commit_sha, created_at").eq("project_id", opts.projectId).order("created_at", { ascending: false }).limit(20),
  ]);

  let headSha: string | null = null;
  let tree: GH.TreeItem[] = [];
  let truncated = false;
  let repoError: string | null = null;
  if (opts.repo && opts.token) {
    try {
      headSha = await GH.getBranchHead(opts.token, opts.repo.full_name, opts.branch ?? opts.repo.default_branch);
      const t = await GH.getTree(opts.token, opts.repo.full_name, headSha);
      tree = t.items;
      truncated = t.truncated;
    } catch (e) {
      repoError = (e as Error).message;
    }
  } else if (opts.repo && !opts.token) {
    repoError = "GitHub não conectado";
  }

  const p = project.data;
  const files = tree.filter((t) => t.type === "blob" && !IGNORE.test(t.path));
  const lines: string[] = [];
  lines.push(`# Projeto: ${p?.name ?? "?"}`);
  if (p?.description) lines.push(p.description);
  if (p?.context_summary) lines.push(`\n## Resumo de contexto\n${p.context_summary}`);
  if (memory.data?.length) {
    lines.push("\n## Memória permanente (mais recente primeiro)");
    for (const m of memory.data) lines.push(`- [${m.kind}] ${m.title}: ${m.content.slice(0, 500)}`);
  }
  if (tasks.data?.length) {
    lines.push("\n## Tarefas abertas");
    for (const t of tasks.data) lines.push(`- (${t.status}) ${t.title} [id ${t.id}]`);
  }
  if (audits.data?.length) {
    lines.push("\n## Auditorias recentes");
    for (const a of audits.data)
      lines.push(`- ${a.status.toUpperCase()} ${a.operation} ${a.file_path ?? ""} ${a.commit_sha ? a.commit_sha.slice(0, 7) : ""} ${a.result ?? ""}`.trim());
  }
  if (changes.data?.length) {
    lines.push("\n## Alterações recentes de arquivos");
    for (const c of changes.data) lines.push(`- ${c.change_type} ${c.file_path} ${c.commit_sha?.slice(0, 7) ?? ""}`);
  }
  if (checkpoints.data?.length) {
    lines.push("\n## Checkpoints abertos");
    for (const c of checkpoints.data) lines.push(`- ${c.reason} em ${c.created_at}: ${c.last_operation ?? "-"}`);
  }
  if (opts.repo) {
    lines.push(`\n## Repositório GitHub: ${opts.repo.full_name} (branch ${opts.branch ?? opts.repo.default_branch})`);
    if (repoError) lines.push(`Erro ao ler o repositório: ${repoError}`);
    else {
      lines.push(`HEAD atual: ${headSha}. ${files.length} arquivos${truncated ? " (lista truncada pelo GitHub)" : ""}.`);
      lines.push(files.slice(0, 400).map((f) => f.path).join("\n"));
      if (files.length > 400) lines.push(`... e mais ${files.length - 400} arquivos (use list_files com prefixo).`);
    }
  } else {
    lines.push("\n## Nenhum repositório vinculado a este chat.");
  }

  const stats: ContextStats = {
    memory: memory.data?.length ?? 0,
    audits: audits.data?.length ?? 0,
    pendingTasks: tasks.data?.length ?? 0,
    openCheckpoints: checkpoints.data?.length ?? 0,
    files: files.length,
    headSha,
    repoError,
  };
  return { text: lines.join("\n"), stats, headSha, tree };
}

// ---------------------------------------------------------------- tools

const TOOLS: ToolDef[] = [
  { type: "function", function: { name: "list_files", description: "Lista arquivos do repositório (opcionalmente filtrando por prefixo de caminho).", parameters: { type: "object", properties: { prefix: { type: "string" } } } } },
  { type: "function", function: { name: "read_file", description: "Lê o conteúdo atual de um arquivo no branch do chat. Obrigatório antes de modificar um arquivo existente.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "Cria ou substitui um arquivo inteiro e faz commit no branch do chat. Retorna commit e verificação real do conteúdo gravado.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string", description: "Conteúdo completo do arquivo" }, commit_message: { type: "string" } }, required: ["path", "content", "commit_message"] } } },
  { type: "function", function: { name: "delete_file", description: "Solicita remoção de um arquivo. Exige aprovação do usuário; não remove imediatamente.", parameters: { type: "object", properties: { path: { type: "string" }, reason: { type: "string" } }, required: ["path", "reason"] } } },
  { type: "function", function: { name: "list_commits", description: "Lista os commits mais recentes do branch.", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
  { type: "function", function: { name: "check_ci", description: "Consulta resultados reais de CI (GitHub Actions/status) de um commit.", parameters: { type: "object", properties: { sha: { type: "string" } }, required: ["sha"] } } },
  { type: "function", function: { name: "compare_versions", description: "Diferenças entre duas referências (branch, tag ou sha).", parameters: { type: "object", properties: { base: { type: "string" }, head: { type: "string" } }, required: ["base", "head"] } } },
  { type: "function", function: { name: "create_branch", description: "Cria um branch a partir do HEAD atual. switch_to=true passa a gravar nele.", parameters: { type: "object", properties: { name: { type: "string" }, switch_to: { type: "boolean" } }, required: ["name"] } } },
  { type: "function", function: { name: "save_memory", description: "Salva uma decisão técnica, contexto, erro ou correção na memória permanente do projeto.", parameters: { type: "object", properties: { kind: { type: "string", enum: ["decision", "context", "file_note", "error", "fix"] }, title: { type: "string" }, content: { type: "string" } }, required: ["kind", "title", "content"] } } },
  { type: "function", function: { name: "update_task", description: "Cria ou atualiza uma tarefa do projeto. Informe task_id para atualizar.", parameters: { type: "object", properties: { task_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: ["pending", "in_progress", "done", "failed", "cancelled"] } }, required: ["title", "status"] } } },
];

export type ToolLogEntry = {
  tool: string;
  ok: boolean;
  summary: string;
  path?: string;
  commit_sha?: string;
  commit_url?: string;
  verified?: boolean;
};

export type ModifiedFile = { path: string; change_type: "create" | "update" | "delete"; blob_sha: string | null; commit_sha: string };

class PausedError extends Error {
  checkpointId: string | null;
  constructor(message: string, checkpointId: string | null) {
    super(message);
    this.checkpointId = checkpointId;
  }
}

function systemPrompt(context: string, resumeNote?: string) {
  return `Você é o agente de desenvolvimento do DEV STUDIO. Trabalha diretamente no repositório GitHub do projeto usando as ferramentas disponíveis.

Regras obrigatórias:
- Planeje brevemente antes de agir. Leia (read_file) antes de modificar um arquivo existente.
- write_file grava o arquivo inteiro e faz um commit; confira o campo "verified" no resultado.
- Este ambiente NÃO executa código. Testes e build reais só existem se o repositório tiver CI (GitHub Actions); use check_ci para consultar. Se não houver CI, diga claramente que nada foi testado automaticamente.
- Nunca declare algo pronto sem evidência real (commit verificado, CI aprovado). A auditoria é feita pelo sistema, não pela sua resposta.
- Remoções exigem aprovação do usuário (delete_file apenas cria o pedido).
- Registre decisões técnicas importantes com save_memory e mantenha tarefas com update_task.
- Não repita operações já concluídas. Não sobrescreva alterações externas sem analisar.
- Responda em português, de forma objetiva, listando arquivos alterados e commits.
${resumeNote ? `\n## RETOMADA DE CHECKPOINT\n${resumeNote}\n` : ""}
${context}`;
}

export type AgentResult = {
  messageId: string | null;
  paused: boolean;
  checkpointId: string | null;
  toolLog: ToolLogEntry[];
  provider: string | null;
  rotations: string[];
};

export async function runAgent(
  db: DB,
  userId: string,
  input: { chatId: string; userMessage: string | null; resumeNote?: string; resumedCheckpointId?: string },
): Promise<AgentResult> {
  const { data: lockToken, error: lockErr } = await db.rpc("acquire_agent_lock", { _chat_id: input.chatId });
  if (lockErr) throw new Error(lockErr.message);
  if (!lockToken) throw new Error("Outro agente já está executando neste chat. Aguarde a conclusão.");

  let finalStatus = "idle";
  try {
    const { data: chat, error: chatErr } = await db.from("chats").select("*").eq("id", input.chatId).single();
    if (chatErr || !chat) throw new Error("Chat não encontrado");
    const repo = chat.repository_id
      ? ((await db.from("repositories").select("*").eq("id", chat.repository_id).single()).data as RepoRow | null)
      : null;
    const gh = repo ? await loadGithubToken(userId) : null;
    let branch = chat.branch ?? repo?.default_branch ?? "main";

    if (input.userMessage) {
      await db.from("chat_messages").insert({ user_id: userId, chat_id: chat.id, role: "user", content: input.userMessage });
    }

    const ctx = await buildProjectContext(db, { projectId: chat.project_id, repo, branch, token: gh?.token ?? null });
    const { data: hist } = await db
      .from("chat_messages")
      .select("role, content, metadata, created_at")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const history: ChatMsg[] = [];
    for (const m of (hist ?? []).reverse()) {
      const meta = (m.metadata ?? {}) as { tool_log?: ToolLogEntry[] };
      if (m.role === "user") history.push({ role: "user", content: m.content });
      else if (m.role === "assistant") {
        const ops = meta.tool_log?.length ? `\n\n[Operações executadas: ${meta.tool_log.map((t) => `${t.tool}${t.path ? ` ${t.path}` : ""}${t.ok ? "" : " (falhou)"}`).join("; ")}]` : "";
        history.push({ role: "assistant", content: (m.content || "") + ops });
      }
    }
    if (input.resumeNote && !input.userMessage) {
      history.push({ role: "user", content: "Retome a tarefa pendente conforme a nota de retomada, validando o estado atual antes de qualquer alteração." });
    }

    const state = {
      readShas: new Map<string, string>(),
      toolLog: [] as ToolLogEntry[],
      modified: [] as ModifiedFile[],
      lastCommitSha: ctx.headSha,
      tree: ctx.tree,
      step: 0,
    };

    // ---- providers and failover
    const keys = chat.model === "builtin" ? [] : await loadGeminiKeys(userId);
    const tried = new Set<string>();
    const exhaustedProjects = new Set<string>();
    const rotations: string[] = [];
    const skippedSeen = new Set<string>();
    let builtinUsed = false;
    type Provider = { kind: "gemini"; key: GeminiKeyRow; apiKey: string } | { kind: "builtin" };
    let provider: Provider | null = null;
    const providerLabel = () => (provider ? (provider.kind === "builtin" ? "Gemini embutido (reserva)" : `Chave "${provider.key.name}"`) : null);

    const pendingTaskTitles = async () => {
      const { data } = await db.from("development_tasks").select("title, status").eq("project_id", chat.project_id).in("status", ["pending", "in_progress", "awaiting_approval"]);
      return (data ?? []).map((t) => `${t.title} (${t.status})`);
    };

    const saveCheckpoint = async (reason: "quota" | "disconnect" | "error" | "auto" | "session_end", err?: string) => {
      const { data } = await db
        .from("checkpoints")
        .insert({
          user_id: userId,
          project_id: chat.project_id,
          chat_id: chat.id,
          reason,
          last_operation: state.toolLog.at(-1)?.summary ?? "Nenhuma operação concluída ainda",
          state: j({
            user_message: input.userMessage ?? null,
            completed_ops: state.toolLog,
            step: state.step,
            model: chat.model,
            provider: providerLabel(),
            last_commit_sha: state.lastCommitSha,
          }),
          modified_files: j(state.modified),
          pending_tasks: j(await pendingTaskTitles()),
          errors: j(err ? [redactSecrets(err)] : []),
          repo_full_name: repo?.full_name ?? null,
          branch,
          head_sha: state.lastCommitSha,
          api_connection_id: provider?.kind === "gemini" ? provider.key.id : null,
        })
        .select("id")
        .single();
      await db.from("development_logs").insert({
        user_id: userId, project_id: chat.project_id, chat_id: chat.id, level: "warn",
        message: `Checkpoint salvo (${reason})`, details: j({ checkpoint_id: data?.id, error: err ? redactSecrets(err) : null }),
      });
      return data?.id ?? null;
    };

    const nextProvider = async (switching: boolean): Promise<Provider | null> => {
      for (;;) {
        const { key, skipped } = pickNextKey(keys, tried, exhaustedProjects);
        for (const s of skipped) {
          if (skippedSeen.has(s.id)) continue;
          skippedSeen.add(s.id);
          rotations.push(`Chave "${s.name}" ignorada: ${s.reason}`);
        }
        if (!key) break;
        tried.add(key.id);
        const apiKey = await decryptSecret(key.secret_ciphertext);
        if (switching) {
          const ping = await pingGemini(apiKey, chat.model);
          await markKey(key.id, { last_tested_at: new Date().toISOString(), status: ping.ok ? "ok" : ping.kind === "quota" ? "quota_exceeded" : ping.kind === "invalid" ? "invalid" : "error", last_error: ping.ok ? null : ping.error, ...(ping.ok || ping.kind !== "quota" ? {} : { quota_exceeded_at: new Date().toISOString() }) });
          if (!ping.ok) {
            if (ping.kind === "quota") exhaustedProjects.add(normalizeProject(key.google_project) || `__key_${key.id}`);
            rotations.push(`Chave reserva "${key.name}" testada e indisponível: ${ping.kind}`);
            continue;
          }
          rotations.push(`Alternado para a chave "${key.name}" após teste bem-sucedido`);
        }
        return { kind: "gemini", key, apiKey };
      }
      if (!builtinUsed) {
        builtinUsed = true;
        rotations.push(keys.length ? "Todas as chaves indisponíveis — usando Gemini embutido como reserva final" : "Nenhuma chave Google ativa — usando Gemini embutido");
        return { kind: "builtin" };
      }
      return null;
    };

    const callModel = async (messages: ChatMsg[]) => {
      const maxAttempts = keys.length + 2;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!provider) {
          provider = chat.model === "builtin" ? ((builtinUsed = true), { kind: "builtin" as const }) : await nextProvider(attempt > 0);
          if (!provider) {
            const cp = await saveCheckpoint("quota", "Nenhuma chave disponível");
            throw new PausedError("Nenhuma chave de IA disponível no momento.", cp);
          }
        }
        try {
          const r = provider.kind === "gemini" ? await callGemini(provider.apiKey, chat.model, messages, TOOLS) : await callBuiltin(messages, TOOLS);
          if (provider.kind === "gemini" && provider.key.status !== "ok") {
            await markKey(provider.key.id, { status: "ok", last_error: null });
            provider.key.status = "ok";
          }
          return r.message;
        } catch (e) {
          if (!(e instanceof AIError)) throw e;
          if (provider.kind === "gemini" && (e.kind === "quota" || e.kind === "invalid")) {
            const k = provider.key;
            if (e.kind === "quota") {
              exhaustedProjects.add(normalizeProject(k.google_project) || `__key_${k.id}`);
              await markKey(k.id, { status: "quota_exceeded", quota_exceeded_at: new Date().toISOString(), last_error: e.message });
              rotations.push(`Cota real esgotada na chave "${k.name}" (HTTP ${e.status})`);
            } else {
              await markKey(k.id, { status: "invalid", last_error: e.message });
              rotations.push(`Chave "${k.name}" rejeitada pelo Google (inválida ou sem permissão)`);
            }
            const cp = await saveCheckpoint(e.kind === "quota" ? "quota" : "error", e.message);
            provider = await nextProvider(true);
            if (!provider) throw new PausedError("Todas as chaves e a reserva estão indisponíveis.", cp);
            if (cp) {
              await db.from("checkpoints").update({ status: "resumed", resumed_at: new Date().toISOString(), state: j({ user_message: input.userMessage, completed_ops: state.toolLog, resumed_with: providerLabel(), auto: true }) }).eq("id", cp);
            }
            continue;
          }
          if (provider.kind === "gemini" && e.kind === "busy") {
            await markKey(provider.key.id, { last_error: e.message });
            rotations.push(`Google sobrecarregado na chave "${provider.key.name}" (HTTP ${e.status}) — tentando a próxima opção`);
            provider = await nextProvider(true);
            if (!provider) {
              const cp = await saveCheckpoint("error", e.message);
              throw new PausedError("O Google está sobrecarregado e não há outra opção disponível agora.", cp);
            }
            continue;
          }
          if (provider.kind === "gemini" && e.kind === "model") {
            throw new Error(`O modelo "${chat.model}" não está disponível para a chave "${provider.key.name}". Escolha outro modelo no chat.`);
          }
          if (e.kind === "network") {
            const cp = await saveCheckpoint("disconnect", e.message);
            throw new PausedError("Conexão com a IA interrompida.", cp);
          }
          const cp = await saveCheckpoint(provider.kind === "builtin" ? "quota" : "error", e.message);
          throw new PausedError(provider.kind === "builtin" ? `Reserva embutida indisponível (${e.status}).` : e.message, cp);
        }
      }
      const cp = await saveCheckpoint("quota", "Tentativas esgotadas");
      throw new PausedError("Limite de tentativas de alternância atingido.", cp);
    };

    // ---- tool execution
    const needRepo = () => {
      if (!repo) return "Nenhum repositório GitHub vinculado a este chat.";
      if (!gh) return "GitHub não conectado nas Configurações.";
      return null;
    };
    const log = (e: ToolLogEntry) => {
      state.toolLog.push(e);
      return e;
    };

    const execTool = async (tc: ToolCall): Promise<string> => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        return JSON.stringify({ error: "Argumentos inválidos (JSON)" });
      }
      const name = tc.function.name;
      try {
        switch (name) {
          case "list_files": {
            const err = needRepo();
            if (err) return JSON.stringify({ error: err });
            const prefix = String(args.prefix ?? "");
            const files = state.tree.filter((t) => t.type === "blob" && t.path.startsWith(prefix) && !IGNORE.test(t.path)).map((t) => t.path);
            log({ tool: name, ok: true, summary: `Listou ${files.length} arquivos${prefix ? ` em ${prefix}` : ""}` });
            return JSON.stringify({ files: files.slice(0, 500), total: files.length });
          }
          case "read_file": {
            const err = needRepo();
            if (err) return JSON.stringify({ error: err });
            const path = String(args.path);
            const f = await GH.getFile(gh!.token, repo!.full_name, path, branch);
            if (!f) {
              log({ tool: name, ok: false, summary: `Arquivo inexistente: ${path}`, path });
              return JSON.stringify({ error: "Arquivo não existe", path });
            }
            state.readShas.set(path, f.sha);
            log({ tool: name, ok: true, summary: `Leu ${path}`, path });
            return JSON.stringify({ path, sha: f.sha, size: f.size, content: f.content.length > 60000 ? f.content.slice(0, 60000) + "\n...[truncado]" : f.content });
          }
          case "write_file": {
            const err = needRepo();
            if (err) return JSON.stringify({ error: err });
            const path = String(args.path).replace(/^\/+/, "");
            const content = String(args.content ?? "");
            const message = String(args.commit_message || `Atualiza ${path}`);
            const current = await GH.getFile(gh!.token, repo!.full_name, path, branch);
            if (current) {
              const read = state.readShas.get(path);
              if (!read) return JSON.stringify({ error: "Leia o arquivo com read_file antes de modificá-lo." });
              if (read !== current.sha)
                return JSON.stringify({ error: "O arquivo foi alterado externamente desde a sua leitura. Leia novamente e reavalie antes de sobrescrever." });
              if (current.content === content) {
                log({ tool: name, ok: true, summary: `Sem alterações em ${path} (conteúdo idêntico)`, path });
                return JSON.stringify({ ok: true, unchanged: true });
              }
            }
            const res = await GH.putFile(gh!.token, repo!.full_name, { path, content, message, branch, sha: current?.sha });
            const verify = await GH.getFile(gh!.token, repo!.full_name, path, res.commitSha);
            const verified = !!verify && verify.content === content && verify.sha === res.blobSha;
            const checks = await GH.getChecks(gh!.token, repo!.full_name, res.commitSha);
            state.readShas.set(path, res.blobSha);
            state.lastCommitSha = res.commitSha;
            const changeType = current ? "update" : "create";
            if (!current) state.tree.push({ path, type: "blob", sha: res.blobSha, size: content.length });
            state.modified.push({ path, change_type: changeType, blob_sha: res.blobSha, commit_sha: res.commitSha });
            await Promise.all([
              db.from("file_changes").insert({
                user_id: userId, project_id: chat.project_id, chat_id: chat.id, repository_id: repo!.id, file_path: path,
                change_type: changeType, commit_sha: res.commitSha, previous_sha: current?.sha ?? null, new_sha: res.blobSha,
                diff_summary: `${message} (${content.split("\n").length} linhas)`,
              }),
              db.from("audit_logs").insert({
                user_id: userId, project_id: chat.project_id, chat_id: chat.id, agent: providerLabel() ?? "dev-agent",
                operation: changeType === "create" ? "Criar arquivo" : "Modificar arquivo", file_path: path, change_summary: message,
                status: verified ? "completed" : "needs_fix",
                result: verified ? "Conteúdo confirmado no commit via GitHub" : "Conteúdo no GitHub difere do enviado",
                evidence: j({ repo_full_name: repo!.full_name, branch, commit_url: res.commitUrl, file_url: res.fileUrl, blob_sha: res.blobSha, previous_sha: current?.sha ?? null, verified_content_match: verified, bytes: content.length }),
                commit_sha: res.commitSha,
                tests: j({ ci_state: checks.state, runs: checks.runs }),
              }),
              db.from("repositories").update({ last_commit_sha: res.commitSha, last_synced_at: new Date().toISOString() }).eq("id", repo!.id),
            ]);
            log({ tool: name, ok: verified, summary: `${changeType === "create" ? "Criou" : "Modificou"} ${path} — commit ${res.commitSha.slice(0, 7)}${verified ? " (verificado)" : " (verificação falhou)"}`, path, commit_sha: res.commitSha, commit_url: res.commitUrl, verified });
            return JSON.stringify({ ok: true, commit_sha: res.commitSha, verified, ci_state: checks.state });
          }
          case "delete_file": {
            const err = needRepo();
            if (err) return JSON.stringify({ error: err });
            const path = String(args.path);
            await db.from("development_tasks").insert({
              user_id: userId, project_id: chat.project_id, chat_id: chat.id, title: `Remover ${path}`, description: String(args.reason ?? ""),
              status: "awaiting_approval", payload: j({ action: "delete_file", path, repository_id: repo!.id, repo_full_name: repo!.full_name, branch }),
            });
            log({ tool: name, ok: true, summary: `Pediu aprovação para remover ${path}`, path });
            return JSON.stringify({ ok: true, awaiting_approval: true, note: "O usuário precisa aprovar em Tarefas." });
          }
          case "list_commits": {
            const err = needRepo();
            if (err) return JSON.stringify({ error: err });
            const commits = await GH.listCommits(gh!.token, repo!.full_name, branch, Math.min(Number(args.limit) || 10, 30));
            log({ tool: name, ok: true, summary: `Consultou ${commits.length} commits` });
            return JSON.stringify(commits.map((c) => ({ sha: c.sha.slice(0, 10), message: c.message.split("\n")[0], author: c.author, date: c.date })));
          }
          case "check_ci": {
            const err = needRepo();
            if (err) return JSON.stringify({ error: err });
            const checks = await GH.getChecks(gh!.token, repo!.full_name, String(args.sha));
            log({ tool: name, ok: true, summary: `CI de ${String(args.sha).slice(0, 7)}: ${checks.state}` });
            return JSON.stringify(checks);
          }
          case "compare_versions": {
            const err = needRepo();
            if (err) return JSON.stringify({ error: err });
            const cmp = await GH.compare(gh!.token, repo!.full_name, String(args.base), String(args.head));
            log({ tool: name, ok: true, summary: `Comparou ${args.base}...${args.head} (${cmp.files.length} arquivos)` });
            return JSON.stringify({ ...cmp, files: cmp.files.map((f) => ({ ...f, patch: f.patch?.slice(0, 1500) ?? null })) });
          }
          case "create_branch": {
            const err = needRepo();
            if (err) return JSON.stringify({ error: err });
            const head = state.lastCommitSha ?? (await GH.getBranchHead(gh!.token, repo!.full_name, branch));
            const nm = String(args.name);
            await GH.createBranch(gh!.token, repo!.full_name, nm, head);
            if (args.switch_to) {
              branch = nm;
              await db.from("chats").update({ branch: nm }).eq("id", chat.id);
            }
            await db.from("audit_logs").insert({ user_id: userId, project_id: chat.project_id, chat_id: chat.id, agent: providerLabel() ?? "dev-agent", operation: "Criar branch", change_summary: nm, status: "completed", result: `Branch criado a partir de ${head.slice(0, 7)}`, evidence: j({ repo_full_name: repo!.full_name, from_sha: head }), commit_sha: head });
            log({ tool: name, ok: true, summary: `Criou branch ${nm}${args.switch_to ? " e passou a usá-lo" : ""}` });
            return JSON.stringify({ ok: true, branch: nm });
          }
          case "save_memory": {
            await db.from("project_memory").insert({ user_id: userId, project_id: chat.project_id, kind: String(args.kind ?? "context"), title: String(args.title).slice(0, 200), content: String(args.content), source_chat_id: chat.id });
            log({ tool: name, ok: true, summary: `Memória: ${String(args.title).slice(0, 80)}` });
            return JSON.stringify({ ok: true });
          }
          case "update_task": {
            const status = String(args.status ?? "pending");
            if (args.task_id) {
              await db.from("development_tasks").update({ title: String(args.title), status, description: args.description ? String(args.description) : undefined, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", String(args.task_id)).eq("project_id", chat.project_id);
            } else {
              await db.from("development_tasks").insert({ user_id: userId, project_id: chat.project_id, chat_id: chat.id, title: String(args.title), description: args.description ? String(args.description) : null, status });
            }
            log({ tool: name, ok: true, summary: `Tarefa "${String(args.title).slice(0, 60)}" → ${status}` });
            return JSON.stringify({ ok: true });
          }
          default:
            return JSON.stringify({ error: `Ferramenta desconhecida: ${name}` });
        }
      } catch (e) {
        const msg = redactSecrets((e as Error).message);
        log({ tool: name, ok: false, summary: `${name} falhou: ${msg.slice(0, 160)}`, path: typeof args.path === "string" ? args.path : undefined });
        await db.from("development_logs").insert({ user_id: userId, project_id: chat.project_id, chat_id: chat.id, level: "error", message: `${name} falhou`, details: j({ error: msg }) });
        return JSON.stringify({ error: msg });
      }
    };

    // ---- main loop
    const messages: ChatMsg[] = [{ role: "system", content: systemPrompt(ctx.text, input.resumeNote) }, ...history];
    let finalText = "";
    let paused: PausedError | null = null;
    try {
      for (state.step = 0; state.step < MAX_STEPS; state.step++) {
        await db.from("agent_sessions").update({ heartbeat_at: new Date().toISOString(), api_connection_id: provider && (provider as Provider).kind === "gemini" ? (provider as { key: GeminiKeyRow }).key.id : null }).eq("chat_id", chat.id);
        const msg = await callModel(messages);
        messages.push(msg);
        if (msg.tool_calls?.length) {
          for (const tc of msg.tool_calls) {
            const out = await execTool(tc);
            messages.push({ role: "tool", tool_call_id: tc.id, content: out });
          }
          continue;
        }
        finalText = (msg.content ?? "").trim();
        break;
      }
      if (!finalText) {
        const cp = await saveCheckpoint("auto", "Limite de etapas por execução atingido");
        finalText = `Atingi o limite de ${MAX_STEPS} etapas nesta execução. Salvei um checkpoint para continuar a partir daqui sem repetir o que já foi feito.`;
        paused = new PausedError("Limite de etapas", cp);
      }
    } catch (e) {
      if (e instanceof PausedError) paused = e;
      else {
        finalStatus = "error";
        const cp = await saveCheckpoint("error", (e as Error).message);
        paused = new PausedError(redactSecrets((e as Error).message), cp);
      }
    }

    if (paused && !finalText) {
      finalText = `⏸ Execução pausada: ${paused.message}\n\nUm checkpoint foi salvo com as operações concluídas, arquivos modificados e tarefas pendentes. Ative ou cadastre outra chave em **Gerenciador de APIs** e use **Retomar** em Checkpoints.`;
    }

    const { data: saved } = await db
      .from("chat_messages")
      .insert({
        user_id: userId,
        chat_id: chat.id,
        role: "assistant",
        content: finalText,
        metadata: j({ tool_log: state.toolLog, provider: providerLabel(), model: provider && (provider as Provider).kind === "builtin" ? "gemini-embutido" : chat.model, rotations, paused: !!paused, checkpoint_id: paused?.checkpointId ?? null, resumed_checkpoint_id: input.resumedCheckpointId ?? null }),
      })
      .select("id")
      .single();

    await updateProjectSummary(db, userId, chat, input.userMessage, state.toolLog);
    if (input.userMessage && chat.title === "Novo chat") {
      await db.from("chats").update({ title: input.userMessage.slice(0, 60) }).eq("id", chat.id);
    } else {
      await db.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chat.id);
    }
    if (rotations.length) {
      await db.from("development_logs").insert({ user_id: userId, project_id: chat.project_id, chat_id: chat.id, level: "info", message: "Alternância de chaves", details: j({ rotations }) });
    }

    return { messageId: saved?.id ?? null, paused: !!paused, checkpointId: paused?.checkpointId ?? null, toolLog: state.toolLog, provider: providerLabel(), rotations };
  } catch (e) {
    finalStatus = "error";
    throw e;
  } finally {
    await db.rpc("release_agent_lock", { _chat_id: input.chatId, _token: lockToken, _status: finalStatus });
  }
}

async function updateProjectSummary(db: DB, userId: string, chat: ChatRow, userMessage: string | null, toolLog: ToolLogEntry[]) {
  const [tasks, changes] = await Promise.all([
    db.from("development_tasks").select("title, status").eq("project_id", chat.project_id).in("status", ["pending", "in_progress", "awaiting_approval"]).limit(15),
    db.from("file_changes").select("file_path, change_type, commit_sha").eq("project_id", chat.project_id).order("created_at", { ascending: false }).limit(10),
  ]);
  const summary = [
    `Atualizado em ${new Date().toISOString()}`,
    userMessage ? `Último pedido: ${userMessage.slice(0, 240)}` : "Última execução: retomada de checkpoint",
    toolLog.length ? `Operações da última execução: ${toolLog.map((t) => t.summary).slice(0, 12).join("; ")}` : "Última execução sem operações no repositório",
    changes.data?.length ? `Arquivos alterados recentemente: ${changes.data.map((c) => `${c.change_type} ${c.file_path}@${c.commit_sha?.slice(0, 7)}`).join(", ")}` : "",
    tasks.data?.length ? `Tarefas abertas: ${tasks.data.map((t) => `${t.title} (${t.status})`).join("; ")}` : "Sem tarefas abertas",
  ].filter(Boolean).join("\n");

  await db.from("projects").update({ context_summary: summary, last_activity_at: new Date().toISOString() }).eq("id", chat.project_id);
  const { data: existing } = await db.from("project_memory").select("id").eq("project_id", chat.project_id).eq("kind", "summary").limit(1).maybeSingle();
  if (existing) await db.from("project_memory").update({ content: summary, source_chat_id: chat.id }).eq("id", existing.id);
  else await db.from("project_memory").insert({ user_id: userId, project_id: chat.project_id, kind: "summary", title: "Resumo estruturado do projeto", content: summary, source_chat_id: chat.id });
}

// ---------------------------------------------------------------- resume

export async function validateCheckpoint(db: DB, userId: string, checkpointId: string) {
  const { data: cp, error } = await db.from("checkpoints").select("*").eq("id", checkpointId).single();
  if (error || !cp) throw new Error("Checkpoint não encontrado");
  const modified = (cp.modified_files ?? []) as unknown as ModifiedFile[];
  const report: string[] = [];
  const divergences: string[] = [];
  let currentHead: string | null = null;
  if (cp.repo_full_name && cp.branch) {
    const gh = await loadGithubToken(userId);
    if (!gh) {
      divergences.push("GitHub não conectado: não foi possível validar o estado real do repositório.");
    } else {
      currentHead = await GH.getBranchHead(gh.token, cp.repo_full_name, cp.branch);
      report.push(`HEAD no checkpoint: ${cp.head_sha?.slice(0, 7) ?? "?"} · HEAD atual: ${currentHead.slice(0, 7)}`);
      if (cp.head_sha && cp.head_sha !== currentHead) {
        try {
          const cmp = await GH.compare(gh.token, cp.repo_full_name, cp.head_sha, currentHead);
          divergences.push(`O branch avançou ${cmp.ahead_by} commit(s) desde o checkpoint. Arquivos alterados externamente: ${cmp.files.map((f) => f.filename).join(", ") || "nenhum"}.`);
        } catch (e) {
          divergences.push(`Não foi possível comparar versões: ${(e as Error).message}`);
        }
      }
      for (const m of modified) {
        const f = await GH.getFile(gh.token, cp.repo_full_name, m.path, cp.branch);
        if (m.change_type === "delete") {
          if (f) divergences.push(`${m.path} deveria estar removido, mas existe.`);
        } else if (!f) divergences.push(`${m.path} não existe mais no branch.`);
        else if (f.sha !== m.blob_sha) divergences.push(`${m.path} foi alterado depois do checkpoint (sha ${f.sha.slice(0, 7)} ≠ ${m.blob_sha?.slice(0, 7)}).`);
        else report.push(`${m.path}: confirmado (${f.sha.slice(0, 7)})`);
      }
    }
  }
  return { cp, report, divergences, currentHead };
}

export async function resumeFromCheckpoint(db: DB, userId: string, checkpointId: string) {
  const { cp, report, divergences } = await validateCheckpoint(db, userId, checkpointId);
  if (!cp.chat_id) throw new Error("Checkpoint sem chat de origem");
  if (cp.status !== "open") throw new Error("Este checkpoint já foi retomado");
  const st = (cp.state ?? {}) as { user_message?: string | null; completed_ops?: ToolLogEntry[] };
  const ops = st.completed_ops ?? [];
  const note = [
    `Checkpoint ${cp.id} (${cp.reason}) criado em ${cp.created_at}.`,
    st.user_message ? `Pedido original do usuário: ${st.user_message}` : "",
    `Última operação concluída: ${cp.last_operation ?? "-"}`,
    ops.length ? `Operações JÁ CONCLUÍDAS (não repetir):\n${ops.map((o) => `- ${o.summary}`).join("\n")}` : "Nenhuma operação havia sido concluída.",
    `Tarefas pendentes: ${((cp.pending_tasks ?? []) as string[]).join("; ") || "nenhuma"}`,
    `Erros registrados: ${((cp.errors ?? []) as string[]).join("; ") || "nenhum"}`,
    `Validação do estado real:\n${[...report, ...divergences].join("\n") || "Sem repositório para validar."}`,
    divergences.length ? "ATENÇÃO: existem divergências. Releia os arquivos afetados e analise antes de qualquer escrita; não sobrescreva alterações externas sem justificar." : "Estado real confere com o checkpoint.",
  ].filter(Boolean).join("\n\n");

  await db.from("chat_messages").insert({
    user_id: userId, chat_id: cp.chat_id, role: "system",
    content: `Retomando checkpoint de ${new Date(cp.created_at).toLocaleString("pt-BR")}.\n\n${[...report, ...divergences].join("\n") || "Sem repositório para validar."}`,
    metadata: j({ kind: "resume", checkpoint_id: cp.id, divergences }),
  });
  await db.from("checkpoints").update({ status: "resumed", resumed_at: new Date().toISOString() }).eq("id", cp.id);
  const result = await runAgent(db, userId, { chatId: cp.chat_id, userMessage: null, resumeNote: note, resumedCheckpointId: cp.id });
  return { ...result, divergences, report, chatId: cp.chat_id };
}

// ---------------------------------------------------------------- audits & approvals

export async function reauditEntry(db: DB, userId: string, auditId: string) {
  const { data: a } = await db.from("audit_logs").select("*").eq("id", auditId).single();
  if (!a) throw new Error("Auditoria não encontrada");
  const ev = (a.evidence ?? {}) as { repo_full_name?: string; blob_sha?: string; branch?: string };
  if (!a.commit_sha || !ev.repo_full_name) throw new Error("Registro sem commit para verificar");
  const gh = await loadGithubToken(userId);
  if (!gh) throw new Error("GitHub não conectado");
  const checks = await GH.getChecks(gh.token, ev.repo_full_name, a.commit_sha);
  let contentOk = true;
  let currentNote = "";
  if (a.file_path && ev.blob_sha) {
    const atCommit = await GH.getFile(gh.token, ev.repo_full_name, a.file_path, a.commit_sha);
    contentOk = !!atCommit && atCommit.sha === ev.blob_sha;
    if (ev.branch) {
      const now = await GH.getFile(gh.token, ev.repo_full_name, a.file_path, ev.branch);
      currentNote = !now ? " Arquivo não existe mais no branch." : now.sha !== ev.blob_sha ? " Arquivo foi alterado depois deste commit." : " Arquivo inalterado no branch.";
    }
  }
  let status: string;
  let result: string;
  if (!contentOk) {
    status = "rejected";
    result = "Conteúdo no commit não corresponde ao registrado.";
  } else if (checks.state === "failure") {
    status = "needs_fix";
    result = "CI reprovado no commit.";
  } else if (checks.state === "pending") {
    status = "running";
    result = "CI em execução.";
  } else if (checks.state === "success") {
    status = "completed";
    result = "Conteúdo confirmado e CI aprovado.";
  } else {
    status = "completed";
    result = "Conteúdo confirmado. Repositório sem CI: build/testes não verificados.";
  }
  await db.from("audit_logs").update({ status, result: result + currentNote, tests: j({ ci_state: checks.state, runs: checks.runs, rechecked_at: new Date().toISOString() }) }).eq("id", a.id);
  return { status, result: result + currentNote, checks };
}

export async function approveDeletion(db: DB, userId: string, taskId: string) {
  const { data: t } = await db.from("development_tasks").select("*").eq("id", taskId).single();
  if (!t || t.status !== "awaiting_approval") throw new Error("Tarefa não está aguardando aprovação");
  const p = (t.payload ?? {}) as { action?: string; path?: string; repo_full_name?: string; branch?: string; repository_id?: string };
  if (p.action !== "delete_file" || !p.path || !p.repo_full_name || !p.branch) throw new Error("Pedido inválido");
  const gh = await loadGithubToken(userId);
  if (!gh) throw new Error("GitHub não conectado");
  const f = await GH.getFile(gh.token, p.repo_full_name, p.path, p.branch);
  if (!f) {
    await db.from("development_tasks").update({ status: "cancelled", description: "Arquivo já não existia" }).eq("id", t.id);
    return { deleted: false };
  }
  const res = await GH.deleteFile(gh.token, p.repo_full_name, { path: p.path, message: `Remove ${p.path} (aprovado pelo usuário)`, branch: p.branch, sha: f.sha });
  const after = await GH.getFile(gh.token, p.repo_full_name, p.path, res.commitSha);
  await Promise.all([
    db.from("development_tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", t.id),
    db.from("file_changes").insert({ user_id: userId, project_id: t.project_id, chat_id: t.chat_id, repository_id: p.repository_id ?? null, file_path: p.path, change_type: "delete", commit_sha: res.commitSha, previous_sha: f.sha }),
    db.from("audit_logs").insert({ user_id: userId, project_id: t.project_id, chat_id: t.chat_id, agent: "usuário (aprovação)", operation: "Remover arquivo", file_path: p.path, change_summary: t.description, status: after ? "failed" : "completed", result: after ? "Arquivo ainda existe após o commit" : "Remoção confirmada no GitHub", evidence: j({ repo_full_name: p.repo_full_name, branch: p.branch, commit_url: res.commitUrl, previous_sha: f.sha }), commit_sha: res.commitSha }),
  ]);
  return { deleted: true, commitSha: res.commitSha };
}
