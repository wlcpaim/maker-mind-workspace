import { LayoutDashboard, MessageSquarePlus, History, FolderKanban, Github, ShieldCheck, Brain, ListChecks, Save, Settings, KeyRound, FlaskConical } from "lucide-react";

export const NAV = [
  { to: "/dashboard", label: "Início", icon: LayoutDashboard },
  { to: "/chat", label: "Novo chat", icon: MessageSquarePlus },
  { to: "/history", label: "Histórico", icon: History },
  { to: "/projects", label: "Projetos", icon: FolderKanban },
  { to: "/repos", label: "Repositórios", icon: Github },
  { to: "/audit", label: "Auditoria", icon: ShieldCheck },
  { to: "/memory", label: "Memória", icon: Brain },
  { to: "/tasks", label: "Tarefas", icon: ListChecks },
  { to: "/checkpoints", label: "Checkpoints", icon: Save },
  { to: "/apis", label: "Gerenciador de APIs", icon: KeyRound },
  { to: "/tests", label: "Central de testes", icon: FlaskConical },
  { to: "/settings", label: "Configurações", icon: Settings },
] as const;

export const BOTTOM = ["/dashboard", "/projects", "/chat", "/history", "/settings"] as const;
