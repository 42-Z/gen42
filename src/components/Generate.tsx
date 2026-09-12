import { useState } from "react";
import {
  IconCopy,
  IconCheck,
  IconDownload,
  IconPhotoOff,
  IconSparkles,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DevelopingSpinner, FrameCorners } from "./graphics";

interface GenerateProps {
  user: any;
  balance: number | null;
  onBalanceChange: (balance: number) => void;
}

export function Generate({ user, balance, onBalanceChange }: GenerateProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [seedCopied, setSeedCopied] = useState(false);

  async function refreshBalance() {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const me = await res.json();
        if (typeof me.balance === "number") onBalanceChange(me.balance);
      }
    } catch {
      /* баланс обновится при следующей загрузке */
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);
    setSeedCopied(false);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: "Turbo",
          width: 1024,
          height: 1024,
          steps: 8,
          guidance: 0.0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка генерации");
      }

      const data = await res.json();
      setResult(data);
      refreshBalance();
    } catch (err: any) {
      setError(err.message);
      refreshBalance();
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!result?.image_url) return;
    try {
      const res = await fetch(result.image_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gen42-${result.seed ?? Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(result.image_url, "_blank");
    }
  }

  async function copySeed() {
    if (result?.seed === null || result?.seed === undefined) return;
    try {
      await navigator.clipboard.writeText(String(result.seed));
      setSeedCopied(true);
      setTimeout(() => setSeedCopied(false), 1500);
    } catch {
      /* буфер обмена недоступен */
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="animate-develop">
        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Генерация
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Опишите, что хотите увидеть. Один кредит — одно изображение.
        </p>
      </div>

      <div className="animate-develop mt-12 space-y-10 [animation-delay:80ms]">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="prompt" className="text-sm font-medium text-foreground">
              Промпт
            </Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {prompt.length}/1000
            </span>
          </div>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="одинокий маяк на скале, туман, ночь, кинематографично, 35мм…"
            maxLength={1000}
            className="text-lg leading-relaxed"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-destructive" role="alert">
            <IconPhotoOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            size="lg"
            className="w-full sm:w-auto sm:min-w-64"
          >
            {loading ? (
              <>
                <DevelopingSpinner className="h-4 w-4" />
                Проявляем…
              </>
            ) : (
              <>
                <IconSparkles className="h-4 w-4" />
                Сгенерировать
              </>
            )}
          </Button>
          {balance === 0 && !loading && (
            <p className="mt-3 text-sm text-muted-foreground">
              Кредиты закончились. Попросите администратора пополнить баланс.
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="animate-develop mt-16" aria-live="polite">
          <div className="flex items-baseline justify-between border-t border-border pt-6">
            <h3 className="font-display text-xl font-semibold text-foreground">
              Проявляем
            </h3>
            <span className="text-sm text-muted-foreground">это займёт несколько секунд</span>
          </div>
          <div className="relative mt-6 aspect-square w-full max-w-xl overflow-hidden rounded-md bg-secondary/40">
            <div className="absolute inset-0 animate-pulse-dot bg-gradient-to-br from-primary/[0.07] via-transparent to-primary/[0.04]" />
            <FrameCorners className="pointer-events-none absolute left-3 top-3 h-6 w-6 text-foreground/40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <DevelopingSpinner className="h-10 w-10 text-primary" />
              <p className="text-sm text-muted-foreground">
                Кадр проявляется, не трогайте плёнку…
              </p>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="animate-develop mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-6">
            <h3 className="font-display text-xl font-semibold text-foreground">Готово</h3>
            <div className="flex items-center gap-2">
              {result.seed !== null && result.seed !== undefined && (
                <button
                  type="button"
                  onClick={copySeed}
                  title="Скопировать seed"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-[0.97]"
                >
                  {seedCopied ? (
                    <IconCheck className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <IconCopy className="h-3.5 w-3.5" />
                  )}
                  Seed: {result.seed}
                </button>
              )}
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <IconDownload className="h-4 w-4" />
                Скачать
              </Button>
            </div>
          </div>
          <div className="group relative mt-6 max-w-xl overflow-hidden rounded-md">
            <img
              src={result.image_url}
              alt="Сгенерированное изображение"
              className="block w-full transition-transform duration-500 group-hover:scale-[1.015]"
            />
            <FrameCorners className="pointer-events-none absolute left-3 top-3 h-6 w-6 text-foreground/80 drop-shadow" />
          </div>
        </div>
      )}
    </div>
  );
}
