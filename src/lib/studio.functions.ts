import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { approveDeletion, reauditEntry, resumeFromCheckpoint, runAgent, validateCheckpoint } from "./agent.server";
import { redactSecrets } from "./crypto.server";

const uuid = z.string().uuid();

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ chatId: uuid, message: z.string().trim().min(1).max(20000) }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      const r = await runAgent(context.supabase as any, context.userId, { chatId: data.chatId, userMessage: data.message });
      return { ok: true as const, paused: r.paused, checkpointId: r.checkpointId, provider: r.provider, rotations: r.rotations, tools: r.toolLog.length, error: null };
    } catch (e) {
      return { ok: false as const, paused: false, checkpointId: null, provider: null, rotations: [], tools: 0, error: redactSecrets((e as Error).message) };
    }
  });

export const checkCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await validateCheckpoint(context.supabase as any, context.userId, data.id);
    return { report: r.report, divergences: r.divergences, currentHead: r.currentHead };
  });

export const resumeCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      const r = await resumeFromCheckpoint(context.supabase as any, context.userId, data.id);
      return { ok: true, chatId: r.chatId, divergences: r.divergences, paused: r.paused, error: null as string | null };
    } catch (e) {
      return { ok: false, chatId: null, divergences: [], paused: false, error: redactSecrets((e as Error).message) };
    }
  });

export const reaudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await reauditEntry(context.supabase as any, context.userId, data.id);
    return { status: r.status, result: r.result };
  });

export const approveTaskDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, confirm: z.literal(true) }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await approveDeletion(context.supabase as any, context.userId, data.id);
    return { deleted: !!(r as any).deleted };
  });

export const schemaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("devstudio_schema_status");
    type Row = { table_name: string; exists_flag: boolean; rls_enabled: boolean; policy_count: number };
    if (error) return { ok: false, error: error.message as string | null, status: [] as Row[] };
    return { ok: true, error: null as string | null, status: (data ?? []) as Row[] };
  });

type T = { suite: string; test_name: string; status: "passed" | "failed" | "skipped"; details: string; duration_ms: number };

export const runSystemTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const uid = context.userId;
    const runId = crypto.randomUUID();
    const out: T[] = [];
    async function t(suite: string, name: string, fn: () => Promise<string | { skip: string }>) {
      const s = Date.now();
      try {
        const r = await fn();
        if (typeof r === "object") out.push({ suite, test_name: name, status: "skipped", details: r.skip, duration_ms: Date.now() - s });
        else out.push({ suite, test_name: name, status: "passed", details: r, duration_ms: Date.now() - s });
      } catch (e) {
        out.push({ suite, test_name: name, status: "failed", details: redactSecrets((e as Error).message), duration_ms: Date.now() - s });
      }
    }
    await t("Instalação", "Estrutura do banco", async () => {
      const { data, error } = await db.rpc("devstudio_schema_status");
      if (error) throw new Error(error.message);
      return JSON.stringify(data).slice(0, 300);
    });
    await t("Autenticação", "Sessão válida no servidor", async () => `Usuário ${uid.slice(0, 8)}… autenticado`);
    await t("Isolamento", "Sem acesso a dados de outros usuários", async () => {
      const tables = ["projects", "chats", "api_connections", "audit_logs", "checkpoints"] as const;
      for (const tb of tables) {
        const { count, error } = await db.from(tb).select("id", { count: "exact", head: true }).neq("user_id", uid);
        if (error) throw new Error(`${tb}: ${error.message}`);
        if ((count ?? 0) > 0) throw new Error(`${tb}: ${count} linha(s) de outro usuário visíveis`);
      }
      return `${tables.length} tabelas verificadas, 0 linhas alheias`;
    });
    await t("Persistência", "Gravar, ler e apagar", async () => {
      const { data: p, error } = await db.from("projects").insert({ user_id: uid, name: `__teste_${runId.slice(0, 6)}`, status: "archived" }).select("id").single();
      if (error) throw new Error(error.message);
      const { data: back } = await db.from("projects").select("name").eq("id", p.id).single();
      if (!back) throw new Error("Não foi possível reler o registro");
      const { error: de } = await db.from("projects").delete().eq("id", p.id);
      if (de) throw new Error(de.message);
      return "Registro criado, relido e removido";
    });
    await t("Conexões", "GitHub", async () => {
      const { data } = await db.from("api_connections").select("status, last_tested_at, metadata").eq("provider", "github").maybeSingle();
      if (!data) return { skip: "GitHub não conectado" };
      const { getAuthenticatedUser } = await import("./github.server");
      const { loadGithubToken } = await import("./agent.server");
      const gh = await loadGithubToken(uid);
      if (!gh) throw new Error("Token indisponível");
      const u = await getAuthenticatedUser(gh.token);
      return `Autenticado como ${u.login}`;
    });
    await t("Conexões", "Chaves Google AI Studio", async () => {
      const { data } = await db.from("api_connections").select("name, status").eq("provider", "gemini");
      if (!data?.length) return { skip: "Nenhuma chave cadastrada (o Gemini embutido será usado)" };
      const ok = data.filter((k) => k.status === "ok").length;
      if (!ok) throw new Error(`Nenhuma das ${data.length} chave(s) está OK — teste-as em Gerenciador de APIs`);
      return `${ok}/${data.length} chave(s) OK no último teste`;
    });
    await t("Auditoria", "Registros verificáveis", async () => {
      const { count } = await db.from("audit_logs").select("id", { count: "exact", head: true });
      return `${count ?? 0} registro(s) de auditoria`;
    });
    await t("Checkpoints", "Checkpoints abertos", async () => {
      const { count } = await db.from("checkpoints").select("id", { count: "exact", head: true }).eq("status", "open");
      return `${count ?? 0} checkpoint(s) aguardando retomada`;
    });
    await db.from("test_results").insert(out.map((r) => ({ ...r, user_id: uid, run_id: runId })) as any);
    return { runId, results: out };
  });
