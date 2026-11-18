import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Terminal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — DEV STUDIO" },
      { name: "description", content: "Acesse seu ambiente privado do DEV STUDIO." },
      { property: "og:title", content: "Entrar — DEV STUDIO" },
      { property: "og:description", content: "Acesse seu ambiente privado do DEV STUDIO." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/dashboard` } });
        if (error) throw error;
        toast.success("Conta criada. Confirme pelo link enviado ao seu email.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function oauth(p: "google" | "lovable") {
    const r = await lovable.auth.signInWithOAuth(p as any, { redirect_uri: window.location.origin + "/auth" });
    if ((r as any).error) toast.error(String((r as any).error.message ?? (r as any).error));
    else if (!(r as any).redirected) nav({ to: "/dashboard", replace: true });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2 font-mono text-sm"><Terminal className="h-4 w-4 text-primary" /> DEV STUDIO</div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "in" | "up")}>
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="in">Entrar</TabsTrigger><TabsTrigger value="up">Criar conta</TabsTrigger></TabsList>
        </Tabs>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" /></div>
          <div className="space-y-2"><Label htmlFor="pw">Senha</Label><Input id="pw" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" /></div>
          <Button type="submit" className="h-11 w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "in" ? "Entrar" : "Criar conta"}</Button>
        </form>
        <div className="grid gap-2">
          <Button variant="outline" className="h-11" onClick={() => oauth("google")}>Continuar com Google</Button>
          <Button variant="outline" className="h-11" onClick={() => oauth("lovable")}>Continuar com Lovable</Button>
        </div>
      </div>
    </main>
  );
}
