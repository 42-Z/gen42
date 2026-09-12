import { useEffect, useState } from "react";
import { IconCoins } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Auth } from "./Auth";
import { Generate } from "./Generate";
import { Gallery } from "./Gallery";
import { Admin } from "./Admin";
import { DevelopingSpinner } from "./graphics";

interface User {
  id: string;
  email: string;
  name?: string;
  isAdmin?: boolean;
}

type View = "generate" | "gallery" | "admin";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [view, setView] = useState<View>("generate");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

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
      <div className="safelight film-grain flex min-h-screen w-full items-center justify-center">
        <DevelopingSpinner className="h-12 w-12 animate-pulse-dot text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="safelight film-grain min-h-screen w-full">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            gen42
          </h1>

          <nav className="flex flex-wrap items-center gap-1.5">
            <NavButton active={view === "generate"} onClick={() => setView("generate")}>
              Генерация
            </NavButton>
            <NavButton active={view === "gallery"} onClick={() => setView("gallery")}>
              Галерея
            </NavButton>
            {user.isAdmin && (
              <NavButton active={view === "admin"} onClick={() => setView("admin")}>
                Админка
              </NavButton>
            )}
            <div className="ml-3 flex items-center gap-3 border-l border-border pl-3">
              {balance !== null && (
                <div
                  className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 py-1 pl-2.5 pr-3 text-sm tabular-nums"
                  title="Один кредит — одно изображение"
                >
                  <IconCoins
                    className={`h-4 w-4 ${balance > 0 ? "text-primary" : "text-muted-foreground"}`}
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

      <main className="mx-auto max-w-7xl px-6 py-12">
        {view === "generate" && (
          <Generate user={user} balance={balance} onBalanceChange={setBalance} />
        )}
        {view === "gallery" && <Gallery user={user} />}
        {view === "admin" && user.isAdmin && <Admin />}
      </main>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-[0.97] ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
