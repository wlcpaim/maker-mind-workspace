import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, GitBranch, ShieldCheck, History, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DEV STUDIO — IDE privada com agente de IA" },
      { name: "description", content: "Desenvolva com um agente Gemini conectado ao seu GitHub, com auditoria real e retomada automática." },
      { property: "og:title", content: "DEV STUDIO — IDE privada com agente de IA" },
      { property: "og:description", content: "Agente Gemini + GitHub + auditoria + checkpoints em um ambiente privado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Bot, t: "Agente de desenvolvimento", d: "Lê, planeja e altera código no seu repositório." },
  { icon: GitBranch, t: "GitHub real", d: "Arquivos, commits, branches e diffs verificados." },
  { icon: ShieldCheck, t: "Auditoria independente", d: "Nada é aprovado só pela resposta da IA." },
  { icon: History, t: "Continuidade", d: "Checkpoints automáticos e retomada validada." },
];

function Landing() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-5 py-14 sm:py-24">
        <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <Terminal className="h-4 w-4 text-primary" /> dev-studio
        </div>
        <div className="max-w-2xl space-y-5">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Seu ambiente privado de desenvolvimento com IA.</h1>
          <p className="text-lg text-muted-foreground">Conecte suas chaves do Google AI Studio e seu GitHub. O agente trabalha, a auditoria confere e os checkpoints garantem que nada se perde.</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/auth">Entrar</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/dashboard">Abrir o painel</Link></Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.t} className="rounded-lg border bg-card p-5">
              <f.icon className="mb-3 h-5 w-5 text-primary" />
              <div className="font-medium">{f.t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
