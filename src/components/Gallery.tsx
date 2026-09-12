import { useEffect, useState } from "react";
import { IconDownload, IconPhotoPlus, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { FrameCorners } from "./graphics";

interface GalleryProps {
  user: any;
}

export function Gallery({ user }: GalleryProps) {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    loadImages();
  }, []);

  useEffect(() => {
    if (selected === null) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [selected]);

  async function loadImages() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/generations");
      if (res.ok) {
        const data = await res.json();
        setImages(data);
      } else {
        setFailed(true);
      }
    } catch (error) {
      console.error("Failed to load images:", error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function downloadImage(url: string, seed: any, idx: number) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `gen42-${seed ?? idx}.png`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Галерея
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-square animate-pulse-dot rounded-md bg-secondary/40" style={{ animationDelay: `${i * 120}ms` }} />
              <div className="mt-3 h-4 w-3/4 rounded bg-secondary/40" />
              <div className="mt-2 h-3 w-1/3 rounded bg-secondary/25" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Галерея
        </h2>
        <div className="flex flex-col items-center gap-4 py-28 text-center">
          <p className="text-sm text-destructive">Не удалось загрузить галерею.</p>
          <Button variant="outline" size="sm" onClick={loadImages}>
            Попробовать снова
          </Button>
        </div>
      </div>
    );
  }

  const selectedImg = selected !== null ? images[selected] : null;

  return (
    <div className="mx-auto max-w-7xl">
      <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
        Галерея
      </h2>

      {images.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-28 text-center">
          <IconPhotoPlus className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Пока пусто. Сделайте первую генерацию — она появится здесь.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, idx) => (
            <figure
              key={img.id}
              className="group animate-develop"
              style={{ animationDelay: `${Math.min(idx * 60, 400)}ms` }}
            >
              <button
                type="button"
                onClick={() => setSelected(idx)}
                className="relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-md bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Открыть изображение: ${img.prompt}`}
              >
                <img
                  src={img.image_url}
                  alt={img.prompt}
                  loading="lazy"
                  className="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <span className="pointer-events-none absolute left-3 top-3 rounded bg-background/70 px-2 py-0.5 font-display text-[10px] tabular-nums text-foreground/90 backdrop-blur-sm">
                  №{String(idx + 1).padStart(2, "0")}
                </span>
                <FrameCorners className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-foreground/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </button>
              <figcaption className="mt-3 space-y-1">
                <p className="line-clamp-2 text-sm text-foreground">{img.prompt}</p>
                <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                  <span>
                    {new Date(img.created_at).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  {img.seed !== null && img.seed !== undefined && <span>seed {img.seed}</span>}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {selectedImg && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-background/90 p-4 backdrop-blur-md animate-develop sm:p-10"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр изображения"
          onClick={() => setSelected(null)}
        >
          <div
            className="flex max-h-full w-full max-w-4xl flex-col items-center gap-5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative min-h-0 w-fit max-w-full">
              <img
                src={selectedImg.image_url}
                alt={selectedImg.prompt}
                className="max-h-[70dvh] w-auto max-w-full rounded-md"
              />
              <FrameCorners className="pointer-events-none absolute left-3 top-3 h-6 w-6 text-foreground/80 drop-shadow" />
            </div>
            <div className="w-full max-w-xl space-y-2 text-center">
              <p className="text-sm leading-relaxed text-foreground">{selectedImg.prompt}</p>
              <div className="flex items-center justify-center gap-4 text-xs tabular-nums text-muted-foreground">
                <span>
                  {new Date(selectedImg.created_at).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                {selectedImg.seed !== null && selectedImg.seed !== undefined && (
                  <span>seed {selectedImg.seed}</span>
                )}
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadImage(selectedImg.image_url, selectedImg.seed, selected ?? 0)
                  }
                >
                  <IconDownload className="h-4 w-4" />
                  Скачать
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  <IconX className="h-4 w-4" />
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="absolute right-5 top-5 rounded-full border border-border bg-background/60 p-2 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.95]"
            aria-label="Закрыть"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
