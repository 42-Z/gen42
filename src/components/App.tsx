import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Auth } from "./Auth";
import { Generate } from "./Generate";
import { Gallery } from "./Gallery";
import { Admin } from "./Admin";

interface User {
  id: string;
  email: string;
  name?: string;
  isAdmin?: boolean;
}

type View = "generate" | "gallery" | "admin";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("generate");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await fetch("/api/auth/get-session");
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          const meRes = await fetch("/api/me");
          const me = meRes.ok ? await meRes.json() : { is_admin: false };
          setUser({ ...data.user, isAdmin: me.is_admin });
        }
      }
    } catch (error) {
      console.error("Session check failed:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <span className="text-xs uppercase tracking-[0.5em] text-muted-foreground animate-pulse">
          loading
        </span>
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b-2 border-foreground bg-background sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-black tracking-tighter uppercase">gen42</h1>
            <Badge variant="outline">krea-2 turbo</Badge>
          </div>

          <nav className="flex items-center gap-2">
            <NavButton active={view === "generate"} onClick={() => setView("generate")}>
              Generate
            </NavButton>
            <NavButton active={view === "gallery"} onClick={() => setView("gallery")}>
              Gallery
            </NavButton>
            {user.isAdmin && (
              <NavButton active={view === "admin"} onClick={() => setView("admin")}>
                Admin
              </NavButton>
            )}
            <div className="ml-2 pl-2 border-l-2 border-foreground flex items-center gap-3">
              <div className="text-xs text-muted-foreground hidden sm:block tabular-nums">
                {user.email}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await fetch("/api/auth/sign-out", { method: "POST" });
                  setUser(null);
                }}
              >
                Sign out
              </Button>
            </div>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {view === "generate" && <Generate user={user} />}
        {view === "gallery" && <Gallery user={user} />}
        {view === "admin" && user.isAdmin && <Admin />}
      </main>

      <footer className="border-t-2 border-foreground mt-20">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
          <span>gen42 · krea-2 turbo · zerogpu</span>
          <span className="tabular-nums">v0.1</span>
        </div>
      </footer>
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
      className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-2 transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-transparent text-foreground border-transparent hover:border-foreground"
      }`}
    >
      {children}
    </button>
  );
}
