import { useState } from "react";
import { IconSparkles, IconPhotoOff } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DevelopingSpinner, FrameCorners } from "./graphics";

interface GenerateProps {
  user: any;
}

export function Generate({ user }: GenerateProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
          <div className="flex items-start gap-2.5 text-sm text-destructive">
            <IconPhotoOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

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
      </div>

      {loading && (
        <div className="animate-develop mt-16 flex flex-col items-center gap-4 border-y border-border py-20">
          <DevelopingSpinner className="h-10 w-10 text-primary" />
          <p className="text-sm text-muted-foreground">Кадр проявляется, не трогайте плёнку…</p>
        </div>
      )}

      {result && (
        <div className="animate-develop mt-16">
          <div className="flex items-baseline justify-between border-t border-border pt-6">
            <h3 className="font-display text-xl font-semibold text-foreground">Готово</h3>
            <span className="text-sm tabular-nums text-muted-foreground">
              Seed: {result.seed}
            </span>
          </div>
          <div className="group relative mt-6 overflow-hidden rounded-md">
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
