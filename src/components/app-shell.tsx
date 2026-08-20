import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AudioLines,
  BrainCircuit,
  Database,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  Plug,
  Search,
  Terminal,
  Upload,
  Users,
  Waypoints,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/calls", label: "Звонки", icon: AudioLines },
  { to: "/upload", label: "Загрузка", icon: Upload },
  { to: "/managers", label: "Менеджеры", icon: Users },
  { to: "/patterns", label: "Паттерны", icon: Waypoints },
  { to: "/objections", label: "Возражения", icon: MessageSquareWarning },
  { to: "/knowledge", label: "База знаний", icon: Database },
  { to: "/search", label: "AI-поиск", icon: Search },
  { to: "/integrations", label: "Интеграции", icon: Plug },
  { to: "/api-docs", label: "API", icon: Terminal },
] as const;

export function AppShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-primary">
            Мегагруп
          </p>
          <p className="mt-1 flex items-center gap-2 font-display text-lg font-semibold">
            <BrainCircuit className="size-5" /> Sales Intelligence
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                pathname.startsWith(item.to)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-xs text-sidebar-foreground/70">{email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={signOut}
          >
            <LogOut className="size-4" /> Выйти
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
          <span className="font-display font-semibold">Sales Intelligence</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Выйти
          </Button>
        </header>
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs",
                pathname.startsWith(item.to)
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
