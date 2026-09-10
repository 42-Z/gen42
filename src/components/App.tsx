import React, { useState, useEffect } from "react";
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

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<"generate" | "gallery" | "admin">("generate");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">gen42</h1>
          <div className="flex gap-4">
            <button
              onClick={() => setView("generate")}
              className={`px-4 py-2 rounded ${view === "generate" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            >
              Generate
            </button>
            <button
              onClick={() => setView("gallery")}
              className={`px-4 py-2 rounded ${view === "gallery" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            >
              Gallery
            </button>
            {user.isAdmin && (
              <button
                onClick={() => setView("admin")}
                className={`px-4 py-2 rounded ${view === "admin" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
              >
                Admin
              </button>
            )}
            <button
              onClick={async () => {
                await fetch("/api/auth/sign-out", { method: "POST" });
                setUser(null);
              }}
              className="px-4 py-2 rounded bg-red-500 text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {view === "generate" && <Generate user={user} />}
        {view === "gallery" && <Gallery user={user} />}
        {view === "admin" && user.isAdmin && <Admin />}
      </main>
    </div>
  );
}
