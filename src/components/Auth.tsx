import { useState } from "react";
import { IconAlertTriangle, IconArrowRight } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MeshBackground,
  PopLogo,
  PopSpinner,
  SparkStar,
  StickerRing,
  StickerSpiral,
} from "./graphics";

interface AuthProps {
  onLogin: (user: any) => void;
}

export function Auth({ onLogin }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isLogin
        ? "/api/auth/sign-in/email"
        : "/api/auth/sign-up/email";
      const body = isLogin
        ? { email, password }
        : { email, password, name };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Ошибка аутентификации");
      }

      const data = await res.json();
      onLogin(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pop-noise relative min-h-screen w-full overflow-hidden">
      <MeshBackground />
      <SparkStar className="animate-float-slow pointer-events-none absolute left-[8%] top-[14%] h-10 w-10" />
      <StickerSpiral className="animate-float-slow pointer-events-none absolute bottom-[12%] left-[12%] h-16 w-16 opacity-80 [animation-delay:1.2s]" />
      <StickerRing className="animate-float-slow pointer-events-none absolute right-[10%] top-[20%] h-20 w-20 opacity-70 [animation-delay:2s]" />

      <div className="mx-auto grid min-h-screen w-full max-w-5xl grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:gap-16">
        <div className="animate-pop-in flex flex-col items-start">
          <PopLogo className="[&_span]:text-5xl lg:[&_span]:text-6xl" />
        </div>

        <div className="animate-pop-in pop-card w-full p-8 [animation-delay:120ms] sm:p-10">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {isLogin ? "Вход" : "Регистрация"}
          </h1>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Имя</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLogin}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 text-sm text-destructive">
                <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={loading} size="lg" className="w-full">
              {loading ? (
                <PopSpinner className="h-4 w-4" aria-label="Загрузка" />
              ) : (
                <>
                  Продолжить
                  <IconArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="rounded-full text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isLogin ? "Нет аккаунта? Создать" : "Уже есть аккаунт? Продолжить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
