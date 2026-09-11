import { useEffect, useState } from "react";
import { IconPhotoPlus } from "@tabler/icons-react";
import { FrameCorners } from "./graphics";

interface GalleryProps {
  user: any;
}

export function Gallery({ user }: GalleryProps) {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadImages();
  }, []);

  async function loadImages() {
    try {
      const res = await fetch("/api/generations");
      if (res.ok) {
        const data = await res.json();
        setImages(data);
      }
    } catch (error) {
      console.error("Failed to load images:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">Загрузка…</div>
    );
  }

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
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
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
              </div>
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
    </div>
  );
}
