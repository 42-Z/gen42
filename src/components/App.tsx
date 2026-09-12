import { useEffect, useState } from "react";
import { IconCoins } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Auth } from "./Auth";
import { Generate } from "./Generate";
import { Gallery } from "./Gallery";
import { Admin } from "./Admin";
import { MeshBackground, PopLogo, PopSpinner } from "./graphics";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  email: string;
  name?: string;
  isAdmin?: boolean;
}

type View = "generate" | "gallery" | "admin";

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "gallery") return "gallery";
  if (h === "admin") return "admin";
  return "generate";
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [view, setView] = useState<View>(() => viewFromHash());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    function onHash() {
      setView(viewFromHash());
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Админка только для админа: чужим — обратно на генерацию
  useEffect(() => {
    if (!loading && user && view === "admin" && !user.isAdmin) {
      window.location.hash = "#/";
    }
  }, [view, user, loading]);

  async function refreshBalance() {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const me = await res.json();
        if (typeof me.balance === "number") setBalance(me.balance);
      }
    } catch {
      /* баланс подтянется при следующей загрузке */
    }
  }

  async function checkSession() {
    try {
      const res = await fetch("/api/auth/get-session");
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          const meRes = await fetch("/api/me");
          const me = meRes.ok
            ? await meRes.json()
            : { is_admin: false, balance: null };
          setUser({ ...data.user, isAdmin: me.is_admin });
          setBalance(me.balance ?? null);
        }
      }
    } catch (error) {
      console.error("Session check failed:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(user: any) {
    setUser(user);
    await refreshBalance();
  }

  if (loading) {
    return (
      <div className="pop-noise relative flex min-h-screen w-full items-center justify-center">
        <MeshBackground />
        <PopSpinner className="h-12 w-12 text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="pop-noise relative min-h-screen w-full">
      <MeshBackground />
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <a href="#/" aria-label="gen42 — на главную">
            <PopLogo />
          </a>

          <nav aria-label="Основная навигация" className="flex flex-wrap items-center gap-1.5">
            <NavLink href="#/" active={view === "generate"}>
              Генерация
            </NavLink>
            <NavLink href="#/gallery" active={view === "gallery"}>
              Галерея
            </NavLink>
            {user.isAdmin && (
              <NavLink href="#/admin" active={view === "admin"}>
                Админка
              </NavLink>
            )}
            <div className="ml-3 flex items-center gap-3 border-l border-border pl-3">
              {balance !== null && (
                <div
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-3 text-sm tabular-nums"
                  title="Один кредит — одно изображение"
                >
                  <IconCoins
                    className={cn("h-4 w-4", balance > 0 ? "text-[#ffd54a]" : "text-muted-foreground")}
                    strokeWidth={1.75}
                  />
                  <span className={balance > 0 ? "text-foreground" : "text-destructive"}>
                    {balance}
                  </span>
                </div>
              )}
              <div className="hidden text-sm text-muted-foreground sm:block">
                {user.email}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await fetch("/api/auth/sign-out", { method: "POST" });
                  setUser(null);
                }}
              >
                Выйти
              </Button>
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {view === "generate" && (
          <Generate user={user} balance={balance} onBalanceChange={setBalance} />
        )}
        {view === "gallery" && <Gallery user={user} />}
        {view === "admin" && user.isAdmin && <Admin />}
      </main>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]",
        active
          ? "pop-gradient-bg text-white shadow-[0_10px_30px_-12px_rgb(255_92_168/0.7)]"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {children}
    </a>
  );
}
