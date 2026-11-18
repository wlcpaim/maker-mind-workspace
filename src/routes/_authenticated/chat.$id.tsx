import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Loader2, Send, CheckCircle2, XCircle, PauseCircle, GitCommit } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendChatMessage } from "@/lib/studio.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loading, ErrorBox } from "@/components/studio/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  head: () => ({ meta: [{ title: "Chat — DEV STUDIO" }, { name: "description", content: "Conversa com o agente de desenvolvimento." }, { property: "og:title", content: "Chat — DEV STUDIO" }, { property: "og:description", content: "Conversa com o agente de desenvolvimento." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const send = useServerFn(sendChatMessage);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chat = useQuery({ queryKey: ["chat", id], queryFn: async () => {
    const { data, error } = await supabase.from("chats").select("*, projects(name), repositories(full_name)").eq("id", id).single();
    if (error) throw error; return data;
  } });
  const msgs = useQuery({ queryKey: ["msgs", id], refetchInterval: sending ? 3000 : false, queryFn: async () => {
    const { data, error } = await supabase.from("chat_messages").select("*").eq("chat_id", id).order("created_at");
    if (error) throw error; return data;
  } });
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.data?.length, pending]);

  async function submit() {
    const m = text.trim(); if (!m || sending) return;
    setSending(true); setPending(m); setText("");
    try {
      const r = await send({ data: { chatId: id, message: m } });
      if (!r.ok) toast.error(r.error ?? "Falha no agente");
      else if (r.paused) toast.warning("Limite atingido: estado salvo em checkpoint. Retome em Checkpoints.");
      else if (r.rotations.length) toast.info(`Chaves alternadas: ${r.rotations.join(" → ")}`);
    } catch (e) { toast.error((e as Error).message); }
    setSending(false); setPending(null);
    qc.invalidateQueries({ queryKey: ["msgs", id] }); qc.invalidateQueries({ queryKey: ["chat", id] });
  }

  const c = chat.data as any;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-4">
        <Button asChild variant="ghost" size="icon" className="h-10 w-10" aria-label="Voltar"><Link to="/history"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c?.title ?? "…"}</div>
          <div className="truncate text-xs text-muted-foreground">{c?.projects?.name}{c?.repositories?.full_name ? ` · ${c.repositories.full_name}@${c.branch}` : " · sem repositório"}</div></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-6">
          {msgs.isLoading ? <Loading /> : msgs.error ? <ErrorBox error={msgs.error} /> : !msgs.data?.length && !pending ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Descreva o que o agente deve fazer. Ele lerá o repositório antes de alterar qualquer coisa.</div>
          ) : msgs.data?.map((m) => <Msg key={m.id} m={m} />)}
          {pending && !msgs.data?.some((m) => m.role === "user" && m.content === pending) && <Msg m={{ role: "user", content: pending }} />}
          {sending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> O agente está trabalhando…</div>}
          <div ref={endRef} />
        </div>
      </div>
      <div className="pb-safe shrink-0 border-t bg-background">
        <form className="mx-auto flex max-w-3xl items-end gap-2 p-2 sm:p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Mensagem para o agente…" aria-label="Mensagem"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer:fine)").matches) { e.preventDefault(); submit(); } }}
            className="max-h-40 min-h-11 resize-none text-base sm:text-sm" />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={sending || !text.trim()} aria-label="Enviar">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
        </form>
      </div>
    </div>
  );
}

function Msg({ m }: { m: { role: string; content: string; metadata?: any } }) {
  const md = m.metadata ?? {};
  if (m.role === "user") return <div className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap break-anywhere rounded-lg bg-primary/15 px-3 py-2 text-sm">{m.content}</div></div>;
  if (m.role === "system") return <div className="whitespace-pre-wrap break-anywhere rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">{m.content}</div>;
  const tools: any[] = md.tool_log ?? [];
  return (
    <div className="space-y-2">
      {tools.length > 0 && (
        <details className="rounded-lg border bg-card text-xs">
          <summary className="cursor-pointer px-3 py-2 text-muted-foreground">{tools.length} operação(ões) · {tools.filter((t) => t.ok).length} ok</summary>
          <ul className="space-y-1 border-t p-2">
            {tools.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                {t.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                <span className="min-w-0 break-anywhere"><span className="font-mono">{t.tool}</span> — {t.summary}
                  {t.commit_url && <a href={t.commit_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-primary"><GitCommit className="h-3 w-3" />{t.commit_sha?.slice(0, 7)}</a>}
                  {t.verified === false && <span className="ml-1 text-warning">(não verificado)</span>}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className={cn("prose-studio break-anywhere text-sm leading-relaxed")}><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {md.provider && <span>{md.provider}</span>}
        {md.paused && <span className="inline-flex items-center gap-1 text-warning"><PauseCircle className="h-3 w-3" /> pausado em checkpoint</span>}
      </div>
    </div>
  );
}
