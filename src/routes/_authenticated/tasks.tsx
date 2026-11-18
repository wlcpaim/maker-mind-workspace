import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { approveTaskDeletion } from "@/lib/studio.functions";
import { Page, Empty, Loading, ErrorBox, Status, fmt } from "@/components/studio/ui";
import { ProjectFilter } from "@/components/studio/ProjectFilter";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Tarefas e execução — DEV STUDIO" }, { name: "description", content: "Tarefas do agente e registros de execução." }, { property: "og:title", content: "Tarefas e execução — DEV STUDIO" }, { property: "og:description", content: "Tarefas do agente e registros de execução." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Tasks,
});

function Tasks() {
  const [p, setP] = useState("all");
  const qc = useQueryClient();
  const approve = useServerFn(approveTaskDeletion);
  const tasks = useQuery({ queryKey: ["tasks", p], queryFn: async () => {
    let q = supabase.from("development_tasks").select("*").order("created_at", { ascending: false }).limit(200);
    if (p !== "all") q = q.eq("project_id", p);
    const { data, error } = await q; if (error) throw error; return data;
  } });
  const logs = useQuery({ queryKey: ["devlogs", p], queryFn: async () => {
    let q = supabase.from("development_logs").select("*").order("created_at", { ascending: false }).limit(50);
    if (p !== "all") q = q.eq("project_id", p);
    const { data, error } = await q; if (error) throw error; return data;
  } });
  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("development_tasks").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }
  async function doApprove(id: string) {
    try { const r = await approve({ data: { id, confirm: true } }); toast.success(r.deleted ? "Arquivo removido no GitHub" : "Nada a remover"); }
    catch (e) { toast.error((e as Error).message); }
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }
  return (
    <Page title="Tarefas" desc="Remoções de arquivos exigem sua aprovação." actions={<ProjectFilter value={p} onChange={setP} />}>
      {tasks.isLoading ? <Loading /> : tasks.error ? <ErrorBox error={tasks.error} /> : !tasks.data?.length ? <Empty>Nenhuma tarefa ainda.</Empty> : (
        <div className="space-y-2">
          {tasks.data.map((t) => {
            const pl = (t.payload ?? {}) as any;
            return (
              <div key={t.id} className="space-y-2 rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0 break-anywhere text-sm font-medium">{t.title}</div><Status s={t.status} /></div>
                {t.description && <div className="break-anywhere text-sm text-muted-foreground">{t.description}</div>}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{fmt(t.created_at)}</span>
                  {t.chat_id && <Link to="/chat/$id" params={{ id: t.chat_id }} className="text-primary">abrir chat</Link>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.status === "awaiting_approval" && pl.kind === "delete_file" ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="sm" variant="destructive">Aprovar remoção</Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Remover {pl.path}?</AlertDialogTitle><AlertDialogDescription>O arquivo será apagado do GitHub com um commit. Motivo: {pl.reason ?? "—"}</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => doApprove(t.id)}>Remover</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : t.status !== "completed" && <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "completed")}>Marcar concluída</Button>}
                  {t.status !== "rejected" && t.status !== "completed" && <Button size="sm" variant="ghost" onClick={() => setStatus(t.id, "rejected")}>Rejeitar</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <h2 className="pt-4 text-sm font-medium">Registros de execução</h2>
      {logs.data?.length ? (
        <div className="space-y-1 rounded-lg border bg-card p-2 font-mono text-xs">
          {logs.data.map((l) => <div key={l.id} className="break-anywhere"><span className="text-muted-foreground">{fmt(l.created_at)}</span> <span className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-warning" : "text-primary"}>[{l.level}]</span> {l.message}</div>)}
        </div>
      ) : <Empty>Sem registros.</Empty>}
    </Page>
  );
}
