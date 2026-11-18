import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useConnections, useProjects, useRepos } from "@/lib/data";
import { Page, Empty, Loading } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/chat/")({
  validateSearch: z.object({ project: z.string().optional() }),
  head: () => ({ meta: [{ title: "Novo chat — DEV STUDIO" }, { name: "description", content: "Monte o contexto e inicie o agente de desenvolvimento." }, { property: "og:title", content: "Novo chat — DEV STUDIO" }, { property: "og:description", content: "Monte o contexto e inicie o agente de desenvolvimento." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NewChat,
});

function NewChat() {
  const search = Route.useSearch();
  const nav = useNavigate();
  const projects = useProjects();
  const repos = useRepos();
  const conns = useConnections();
  const [projectId, setProjectId] = useState(search.project ?? "");
  const [repoId, setRepoId] = useState("none");
  const [model, setModel] = useState("auto");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const projRepos = repos.data?.filter((r) => r.project_id === projectId) ?? [];
  useEffect(() => { setRepoId(projRepos[0]?.id ?? "none"); }, [projectId, repos.data]); // eslint-disable-line
  const keys = conns.data?.filter((c) => c.provider === "gemini" && c.is_active) ?? [];
  const models = Array.from(new Set(keys.map((k) => k.model).filter(Boolean))) as string[];
  const ctx = useQuery({ queryKey: ["ctx", projectId], enabled: !!projectId, queryFn: async () => {
    const [m, t, a, c, cp] = await Promise.all([
      supabase.from("project_memory").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("development_tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId).neq("status", "completed"),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("chats").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("checkpoints").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "open"),
    ]);
    return { memory: m.count ?? 0, tasks: t.count ?? 0, audits: a.count ?? 0, chats: c.count ?? 0, cps: cp.count ?? 0 };
  } });

  async function start() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const repo = repos.data?.find((r) => r.id === repoId);
    const { data, error } = await supabase.from("chats").insert({
      user_id: u.user!.id, project_id: projectId, repository_id: repo?.id ?? null, branch: repo?.default_branch ?? null,
      model: model === "auto" ? (keys.find((k) => k.is_primary)?.model ?? "gemini-2.5-flash") : model, title: title.trim() || "Novo chat",
    }).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    nav({ to: "/chat/$id", params: { id: data.id } });
  }

  if (projects.isLoading) return <Loading />;
  if (!projects.data?.length) return <Page title="Novo chat"><Empty>Crie um projeto primeiro em Projetos.</Empty></Page>;
  return (
    <Page title="Novo chat" desc="O agente recebe histórico, memória, auditorias, tarefas e o estado real do GitHub.">
      <div className="grid max-w-2xl grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:p-5 [&>*]:min-w-0">
        <div className="space-y-2"><Label>Projeto</Label>
          <Select value={projectId} onValueChange={setProjectId}><SelectTrigger className="h-11"><SelectValue placeholder="Escolha um projeto" /></SelectTrigger>
            <SelectContent>{projects.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Repositório</Label>
          <Select value={repoId} onValueChange={setRepoId} disabled={!projectId}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">Sem repositório</SelectItem>{projRepos.map((r) => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}</SelectContent></Select>
          {projectId && !projRepos.length && <p className="text-xs text-muted-foreground">Nenhum repositório vinculado a este projeto (vincule em Repositórios).</p>}</div>
        <div className="space-y-2"><Label>Modelo</Label>
          <Select value={model} onValueChange={setModel}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="auto">Automático</SelectItem>{models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
          <p className="text-xs text-muted-foreground">Automático: chave principal → reservas → Gemini embutido.</p></div>
        <div className="space-y-2"><Label>Título (opcional)</Label><Input className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></div>
        {ctx.data && <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-5">
          {[["Chats", ctx.data.chats], ["Memórias", ctx.data.memory], ["Tarefas abertas", ctx.data.tasks], ["Auditorias", ctx.data.audits], ["Checkpoints", ctx.data.cps]].map(([l, v]) => (
            <div key={l as string} className="rounded bg-muted/50 p-2"><div className="text-base font-semibold">{v}</div><div className="text-muted-foreground">{l}</div></div>))}
        </div>}
        <Button className="h-11" disabled={!projectId || busy} onClick={start}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Iniciar agente</Button>
      </div>
    </Page>
  );
}
