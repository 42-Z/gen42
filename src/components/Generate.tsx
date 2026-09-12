import { useState } from "react";
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconPhotoOff,
  IconSparkles,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  EmptyCanvasArt,
  PopSkeleton,
  PopSpinner,
  SparkStar,
  StickerBurst,
} from "./graphics";

interface GenerateProps {
  user: any;
  balance: number | null;
  onBalanceChange: (balance: number) => void;
}

const EXAMPLE_PROMPTS = [
  "Рыжий кот-астронавт в иллюминаторе, звёзды, неон",
  "Уютный домик в лесу осенью, тёплый свет в окнах",
  "Летающий замок над облаками на закате, акварель",
  "Ретро-автомобиль у моря, пальмы, постер 80-х",
];

export function Generate({ user, balance, onBalanceChange }: GenerateProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [seedCopied, setSeedCopied] = useState(false);

  const outOfCredits = balance === 0;

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
    if (!prompt.trim() || outOfCredits) return;

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
    <div className="mx-auto max-w-3xl">
      <div className="animate-pop-in text-center">
        <div className="flex items-center justify-center gap-2">
          <SparkStar className="h-6 w-6" />
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Что нарисуем?
          </h2>
          <SparkStar className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Опишите картинку словами. Один кредит — одно изображение.
        </p>
      </div>

      <div className="animate-pop-in pop-card mt-10 p-6 [animation-delay:80ms] sm:p-8">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="prompt" className="text-sm font-medium text-foreground">
              Ваш замысел
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
            placeholder="Например: одинокий маяк на скале в тумане, ночь, кинематографично…"
            maxLength={1000}
            className="border-0 bg-transparent px-0 text-lg leading-relaxed"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2" aria-label="Примеры для старта">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
            >
              {ex}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-2.5 text-sm text-destructive" role="alert">
            <IconPhotoOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6">
          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim() || outOfCredits}
            aria-describedby={outOfCredits ? "balance-hint" : undefined}
            title={outOfCredits ? "Нет кредитов для генерации" : undefined}
            size="lg"
            className="w-full"
          >
            {loading ? (
              <>
                <PopSpinner className="h-4 w-4" />
                Рисуем…
              </>
            ) : (
              <>
                <IconSparkles className="h-4 w-4" />
                Сгенерировать
              </>
            )}
          </Button>
          {outOfCredits && !loading && (
            <p id="balance-hint" className="mt-3 text-center text-sm text-muted-foreground">
              Кредиты закончились — генерация недоступна. Попросите администратора
              пополнить баланс.
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="animate-pop-in mt-10" aria-live="polite">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-xl font-bold text-foreground">Рисуем</h3>
            <span className="text-sm text-muted-foreground">это займёт несколько секунд</span>
          </div>
          <PopSkeleton className="mt-5 aspect-square w-full" />
          <div className="mt-4 space-y-2">
            <PopSkeleton className="h-4 w-2/3 !rounded-full" />
            <PopSkeleton className="h-3 w-1/3 !rounded-full" />
          </div>
        </div>
      )}

      {!loading && !result && (
        <div className="animate-pop-in mt-10 flex flex-col items-center gap-3 py-10 text-center [animation-delay:140ms]">
          <EmptyCanvasArt className="h-44 w-auto" />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Холст ждёт первую идею. Выберите пример выше или опишите своё —
            результат появится прямо здесь.
          </p>
        </div>
      )}

      {result && (
        <div className="animate-pop-in relative mt-10">
          <StickerBurst className="animate-float-slow absolute -right-4 -top-8 h-16 w-16 sm:-right-8" />
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-display text-xl font-bold text-foreground">Готово</h3>
            <div className="flex items-center gap-2">
              {result.seed !== null && result.seed !== undefined && (
                <button
                  type="button"
                  onClick={copySeed}
                  title="Скопировать seed"
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm tabular-nums text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
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
          <div className="pop-card pop-lift group relative mt-5 overflow-hidden p-2">
            <img
              src={result.image_url}
              alt={prompt || "Сгенерированное изображение"}
              className="block w-full rounded-[14px] transition-transform duration-500 group-hover:scale-[1.015]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
