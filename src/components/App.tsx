import { useEffect, useRef, useState } from "react";
import {
  IconCoins,
  IconLogout,
  IconSettings,
  IconUserCircle,
} from "@tabler/icons-react";
import { Auth } from "./Auth";
import { Generate } from "./Generate";
import { Admin } from "./Admin";
import { MeshBackground, PopLogo, PopSpinner } from "./graphics";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  email: string;
  name?: string;
  isAdmin?: boolean;
}

type View = "main" | "admin";

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "admin") return "admin";
  return "main";
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

  // Админка только для админа: чужим — на главный экран
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

  async function handleLogout() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    setUser(null);
    setBalance(null);
    window.location.hash = "#/";
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

          <div className="flex items-center gap-3">
            {balance === null ? (
              <div
                className="h-8 w-16 animate-pulse rounded-full bg-secondary/60"
                aria-hidden
              />
            ) : (
              <div
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm tabular-nums"
                role="status"
                aria-label={`Баланс: ${balance}`}
              >
                <IconCoins
                  className={cn("h-4 w-4", balance > 0 ? "text-[#ffd54a]" : "text-destructive")}
                  strokeWidth={1.75}
                />
                <span className={balance > 0 ? "text-foreground" : "text-destructive"}>
                  {balance}
                </span>
              </div>
            )}
            <AccountMenu user={user} onLogout={handleLogout} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {view === "admin" && user.isAdmin ? (
          <Admin />
        ) : (
          <Generate balance={balance} onBalanceChange={setBalance} />
        )}
      </main>
    </div>
  );
}

function AccountMenu({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open ]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Аккаунт"
        className="rounded-full border border-border bg-card p-2 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.95]"
      >
        <IconUserCircle className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Аккаунт"
          className="pop-card animate-pop-in absolute right-0 top-full z-50 mt-2 w-60 p-2"
        >
          <p className="truncate px-3 pb-2 pt-1.5 text-xs text-muted-foreground" title={user.email}>
            {user.email}
          </p>
          {user.isAdmin && (
            <a
              role="menuitem"
              href="#/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm text-foreground transition-colors outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconSettings className="h-4 w-4 text-muted-foreground" />
              Админка
            </a>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm text-foreground transition-colors outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconLogout className="h-4 w-4 text-muted-foreground" />
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}
