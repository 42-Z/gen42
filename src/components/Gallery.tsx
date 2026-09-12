import { useEffect, useState } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { EmptyGalleryArt, PopSkeleton, SparkStar } from "./graphics";

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
      if (e.key === "ArrowRight") setSelected((s) => (s === null ? s : (s + 1) % images.length));
      if (e.key === "ArrowLeft")
        setSelected((s) => (s === null ? s : (s - 1 + images.length) % images.length));
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [selected, images.length]);

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

  function step(dir: 1 | -1) {
    setSelected((s) => {
      if (s === null || images.length === 0) return s;
      return (s + dir + images.length) % images.length;
    });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          Галерея
        </h2>
        <div className="mt-10 columns-1 gap-6 sm:columns-2 lg:columns-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mb-6 break-inside-avoid">
              <PopSkeleton
                className="w-full"
                style={{ height: `${[320, 240, 400, 280, 360, 260][i]}px` }}
              />
              <div className="mt-3 h-4 w-3/4 rounded-full bg-secondary/60" />
              <div className="mt-2 h-3 w-1/3 rounded-full bg-secondary/40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          Галерея
        </h2>
        <div className="flex flex-col items-center gap-4 py-28 text-center">
          <p role="alert" className="text-sm text-destructive">
            Не удалось загрузить галерею.
          </p>
          <Button variant="outline" size="sm" onClick={loadImages}>
            Попробовать снова
          </Button>
        </div>
      </div>
    );
  }

  const selectedImg = selected !== null ? images[selected] : null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2.5">
        <SparkStar className="h-6 w-6" />
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          Галерея
        </h2>
      </div>

      {images.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <EmptyGalleryArt className="h-48 w-auto" />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Пока пусто. Сделайте первую генерацию — она появится здесь яркой
            карточкой.
          </p>
          <Button asChild>
            <a href="#/">К генерации</a>
          </Button>
        </div>
      ) : (
        <div className="mt-10 columns-1 gap-6 sm:columns-2 lg:columns-3">
          {images.map((img, idx) => (
            <figure
              key={img.id}
              className="animate-pop-in mb-6 break-inside-avoid"
              style={{ animationDelay: `${Math.min(idx * 60, 400)}ms` }}
            >
              <button
                type="button"
                onClick={() => setSelected(idx)}
                className="pop-card pop-lift group relative block w-full cursor-zoom-in overflow-hidden p-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Открыть изображение: ${img.prompt}`}
              >
                <img
                  src={img.image_url}
                  alt={img.prompt}
                  loading="lazy"
                  className="block w-full rounded-[14px] object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
                <span className="absolute left-4 top-4 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur-sm">
                  №{String(idx + 1).padStart(2, "0")}
                </span>
              </button>
              <figcaption className="mt-3 space-y-1 px-1">
                <p className="line-clamp-2 text-sm text-foreground">{img.prompt}</p>
                <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                  <span>
                    {new Date(img.created_at).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  {img.seed !== null && img.seed !== undefined && (
                    <span className="rounded-full bg-secondary px-2 py-0.5">
                      seed {img.seed}
                    </span>
                  )}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {selectedImg && (
        <div
          className="animate-pop-in fixed inset-0 z-[70] flex items-center justify-center bg-background/90 p-4 backdrop-blur-md sm:p-10"
          role="dialog"
          aria-modal="true"
          aria-label={`Просмотр изображения ${selected! + 1} из ${images.length}`}
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
                className="max-h-[70dvh] w-auto max-w-full rounded-[22px] border border-border"
              />
            </div>
            <div className="w-full max-w-xl space-y-2 text-center">
              <p className="text-sm leading-relaxed text-foreground">{selectedImg.prompt}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {selected! + 1} / {images.length}
                {" · "}
                {new Date(selectedImg.created_at).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                {selectedImg.seed !== null && selectedImg.seed !== undefined && (
                  <>{" · "}seed {selectedImg.seed}</>
                )}
              </p>
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

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Предыдущее изображение"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card/90 p-3 text-foreground transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 sm:left-6"
              >
                <IconChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Следующее изображение"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card/90 p-3 text-foreground transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 sm:right-6"
              >
                <IconChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setSelected(null)}
            className="absolute right-5 top-5 rounded-full border border-border bg-card/80 p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.95]"
            aria-label="Закрыть"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
