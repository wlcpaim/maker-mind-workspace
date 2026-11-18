import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Github, Database, KeyRound, Loader2, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveGithubToken, testGithub, deleteConnection } from "@/lib/connections.functions";
import { schemaStatus } from "@/lib/studio.functions";
import { useConnections } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { Page, Status, fmt, Loading } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — DEV STUDIO" }, { name: "description", content: "Banco de dados, GitHub e IA." }, { property: "og:title", content: "Configurações — DEV STUDIO" }, { property: "og:description", content: "Banco de dados, GitHub e IA." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Settings,
});

function Settings() {
  const conns = useConnections();
  const qc = useQueryClient();
  const save = useServerFn(saveGithubToken);
  const test = useServerFn(testGithub);
  const del = useServerFn(deleteConnection);
  const status = useServerFn(schemaStatus);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const schema = useQuery({ queryKey: ["schema"], queryFn: () => status() });
  const migrations = useQuery({ queryKey: ["migrations"], queryFn: async () => (await supabase.from("migration_history").select("*").order("applied_at", { ascending: false })).data ?? [] });
  const gh = conns.data?.find((c) => c.provider === "github");
  const keys = conns.data?.filter((c) => c.provider === "gemini") ?? [];
  const rows = schema.data?.status ?? [];
  const ok = rows.length > 0 && rows.every((r) => r.exists_flag && r.rls_enabled && r.policy_count > 0);
  async function run(k: string, fn: () => Promise<any>, msg: (r: any) => string) {
    setBusy(k);
    try { const r = await fn(); toast.success(msg(r)); qc.invalidateQueries({ queryKey: ["connections"] }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  return (
    <Page title="Configurações" desc="Conexões do seu ambiente.">
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="flex items-center gap-2 font-medium"><Database className="h-4 w-4" /> Banco de dados</h2>
        {schema.isLoading ? <Loading /> : (
          <>
            <div className="flex items-center gap-2 text-sm">{ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}{ok ? `Instalado: ${rows.length} tabelas com proteção por usuário ativa` : schema.data?.error ?? "Estrutura incompleta"}</div>
            <div className="text-xs text-muted-foreground">Versão: {migrations.data?.[0]?.version ?? "—"} · {migrations.data?.[0]?.name ?? ""} · aplicada {fmt(migrations.data?.[0]?.applied_at)}</div>
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Ver tabelas</summary>
              <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">{rows.map((r) => <div key={r.table_name} className="flex justify-between gap-2 rounded bg-muted/50 px-2 py-1 font-mono"><span className="truncate">{r.table_name}</span><span className={r.rls_enabled ? "text-success" : "text-destructive"}>{r.rls_enabled ? `RLS · ${r.policy_count}` : "sem RLS"}</span></div>)}</div>
            </details>
          </>
        )}
      </section>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="flex items-center gap-2 font-medium"><Github className="h-4 w-4" /> GitHub</h2>
        {gh ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Conectado como <b>{(gh.metadata as any)?.login}</b> <span className="font-mono text-xs text-muted-foreground">{gh.secret_hint}</span></span><Status s={gh.status} /></div>
            <div className="break-anywhere text-xs text-muted-foreground">Permissões: {((gh.metadata as any)?.scopes ?? []).join(", ") || "token fine-grained (sem escopos clássicos)"} · testado {fmt(gh.last_tested_at)}</div>
            {gh.last_error && <div className="text-xs text-destructive">{gh.last_error}</div>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy === "t"} onClick={() => run("t", () => test(), (r) => r.ok ? `OK: ${r.login}` : `Falhou: ${r.error}`)}>{busy === "t" && <Loader2 className="h-4 w-4 animate-spin" />} Testar</Button>
              <Button size="sm" variant="ghost" onClick={() => confirm("Desconectar o GitHub?") && run("d", () => del({ data: { id: gh.id } }), () => "GitHub desconectado")}><Trash2 className="h-4 w-4" /> Desconectar</Button>
            </div>
          </>
        ) : <p className="text-sm text-muted-foreground">Crie um token em GitHub → Settings → Developer settings → Personal access tokens. Permissões mínimas: Contents (leitura e escrita), Metadata (leitura) e, opcionalmente, Administration para criar repositórios.</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="password" autoComplete="off" placeholder={gh ? "Substituir token" : "ghp_… ou github_pat_…"} value={token} onChange={(e) => setToken(e.target.value)} className="h-10" />
          <Button disabled={token.length < 20 || busy === "s"} onClick={() => run("s", async () => { const r = await save({ data: { name: "GitHub", token } }); setToken(""); return r; }, (r) => `Conectado como ${r.login}`)}>{busy === "s" && <Loader2 className="h-4 w-4 animate-spin" />} Salvar token</Button>
        </div>
      </section>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4" /> Google AI Studio</h2>
        <p className="text-sm text-muted-foreground">{keys.length} chave(s) cadastrada(s). Reserva final: Gemini embutido.</p>
        <Button asChild size="sm" variant="outline"><Link to="/apis">Gerenciar chaves</Link></Button>
      </section>
    </Page>
  );
}
