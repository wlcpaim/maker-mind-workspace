import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Plus, RefreshCw, Lock, Globe, Loader2, GitCommit } from "lucide-react";
import { toast } from "sonner";
import { listGithubRepos, importRepository, createGithubRepo, updateRepository, syncRepository, repoCommits } from "@/lib/github.functions";
import { useConnections, useProjects, useRepos } from "@/lib/data";
import { Page, Empty, Loading, ErrorBox, fmt } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/repos")({
  head: () => ({ meta: [{ title: "Repositórios GitHub — DEV STUDIO" }, { name: "description", content: "Repositórios vinculados aos seus projetos." }, { property: "og:title", content: "Repositórios GitHub — DEV STUDIO" }, { property: "og:description", content: "Repositórios vinculados aos seus projetos." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Repos,
});

function Repos() {
  const conns = useConnections();
  const repos = useRepos();
  const projects = useProjects();
  const qc = useQueryClient();
  const list = useServerFn(listGithubRepos);
  const imp = useServerFn(importRepository);
  const create = useServerFn(createGithubRepo);
  const upd = useServerFn(updateRepository);
  const sync = useServerFn(syncRepository);
  const commits = useServerFn(repoCommits);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [newRepo, setNewRepo] = useState({ name: "", private: true });
  const [showCommits, setShowCommits] = useState<string | null>(null);
  const remote = useQuery({ queryKey: ["gh-remote"], enabled: importOpen, queryFn: () => list({ data: { page: 1 } }) });
  const cm = useQuery({ queryKey: ["commits", showCommits], enabled: !!showCommits, queryFn: () => commits({ data: { id: showCommits! } }) });
  const gh = conns.data?.find((c) => c.provider === "github");
  const refresh = () => qc.invalidateQueries({ queryKey: ["repos"] });
  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  if (conns.isLoading) return <Loading />;
  if (!gh) return <Page title="Repositórios"><Empty>Conecte o GitHub em Configurações para listar e importar repositórios.</Empty></Page>;

  return (
    <Page title="Repositórios" desc={`Conectado como ${(gh.metadata as any)?.login ?? "?"}`} actions={<>
      <Button variant="outline" onClick={() => setImportOpen(true)}><Download className="h-4 w-4" /> Importar</Button>
      <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Criar</Button></>}>
      {repos.isLoading ? <Loading /> : repos.error ? <ErrorBox error={repos.error} /> : !repos.data?.length ? <Empty>Nenhum repositório importado.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {repos.data.map((r) => (
            <div key={r.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <a href={r.html_url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 break-anywhere font-mono text-sm hover:text-primary">{r.full_name}</a>
                {r.private ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </div>
              <div className="text-xs text-muted-foreground">branch {r.default_branch} · HEAD {r.last_commit_sha?.slice(0, 7) ?? "—"} · sincronizado {fmt(r.last_synced_at)}</div>
              <Select value={r.project_id ?? "none"} onValueChange={(v) => run(r.id + "p", () => upd({ data: { id: r.id, projectId: v === "none" ? null : v } }), "Vínculo atualizado")}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sem projeto</SelectItem>{projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <label className="flex items-center justify-between gap-2 text-sm"><span>Agente pode escrever</span><Switch checked={r.is_authorized} onCheckedChange={(v) => run(r.id + "a", () => upd({ data: { id: r.id, isAuthorized: v } }), v ? "Escrita autorizada" : "Escrita bloqueada")} /></label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" disabled={busy === r.id} onClick={() => run(r.id, () => sync({ data: { id: r.id } }), "Sincronizado com o GitHub")}>{busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizar</Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowCommits(r.id)}><GitCommit className="h-4 w-4" /> Commits</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden">
          <DialogHeader><DialogTitle>Importar do GitHub</DialogTitle></DialogHeader>
          <Input placeholder="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="max-h-[55dvh] space-y-1 overflow-y-auto">
            {remote.isLoading ? <Loading /> : remote.error ? <ErrorBox error={remote.error} /> : remote.data?.repos.filter((r: any) => r.full_name.toLowerCase().includes(filter.toLowerCase())).map((r: any) => {
              const has = repos.data?.some((x) => x.full_name === r.full_name);
              return (
                <div key={r.full_name} className="flex items-center justify-between gap-2 rounded p-2 hover:bg-accent">
                  <span className="min-w-0 break-anywhere font-mono text-xs">{r.full_name}</span>
                  <Button size="sm" variant={has ? "ghost" : "secondary"} disabled={has || busy === r.full_name} onClick={() => run(r.full_name, () => imp({ data: { fullName: r.full_name, projectId: null } }), "Repositório importado")}>{has ? "Importado" : "Importar"}</Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar repositório</DialogTitle></DialogHeader>
          <Input placeholder="nome-do-repositorio" value={newRepo.name} onChange={(e) => setNewRepo({ ...newRepo, name: e.target.value })} />
          <label className="flex items-center justify-between text-sm">Privado <Switch checked={newRepo.private} onCheckedChange={(v) => setNewRepo({ ...newRepo, private: v })} /></label>
          <DialogFooter><Button disabled={!newRepo.name || busy === "new"} onClick={() => run("new", async () => { await create({ data: { name: newRepo.name, private: newRepo.private, projectId: null } }); setCreateOpen(false); }, "Repositório criado no GitHub")}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!showCommits} onOpenChange={(o) => !o && setShowCommits(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Commits recentes</DialogTitle></DialogHeader>
          {cm.isLoading ? <Loading /> : cm.error ? <ErrorBox error={cm.error} /> : (cm.data as any[])?.map((c: any) => (
            <div key={c.sha} className="border-b py-2 text-sm"><div className="font-mono text-xs text-primary">{c.sha.slice(0, 7)}</div><div className="break-anywhere">{c.message?.split("\n")[0]}</div><div className="text-xs text-muted-foreground">{c.author} · {fmt(c.date)}</div></div>
          ))}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
