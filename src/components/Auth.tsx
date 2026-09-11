import { useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DevelopingSpinner, Perforations } from "./graphics";

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
    <div className="safelight film-grain min-h-screen w-full">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-16 px-6 py-16 lg:grid-cols-2 lg:gap-24">
        <div className="animate-develop flex flex-col items-start">
          <h1 className="font-display text-6xl font-extrabold tracking-tight text-foreground lg:text-7xl">
            gen42
          </h1>
          <p className="mt-4 max-w-sm text-lg leading-relaxed text-muted-foreground">
            Генерация изображений. Опишите кадр словами — получите картинку.
          </p>
          <Perforations className="mt-10 opacity-50" />
        </div>

        <div className="animate-develop w-full [animation-delay:120ms]">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {isLogin ? "Вход" : "Регистрация"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isLogin
              ? "Введите свои данные, чтобы продолжить"
              : "Создайте аккаунт, чтобы начать генерацию"}
          </p>

          <form onSubmit={handleSubmit} className="mt-10 space-y-8">
            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Имя</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLogin}
                  className="text-lg"
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
                className="text-lg"
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
                className="text-lg"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 text-sm text-destructive">
                <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={loading} size="lg" className="w-full">
              {loading ? (
                <>
                  <DevelopingSpinner className="h-4 w-4" />
                  Проявляем…
                </>
              ) : isLogin ? (
                "Войти"
              ) : (
                "Создать аккаунт"
              )}
            </Button>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              {isLogin ? "Нет аккаунта? Создать" : "Уже есть аккаунт? Войти"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
