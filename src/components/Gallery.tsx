import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    return <div className="text-center py-20 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-4xl font-black uppercase tracking-tighter text-foreground">Gallery</h2>
        <Badge variant="outline">{images.length} image{images.length === 1 ? "" : "s"}</Badge>
      </div>

      {images.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No images yet. Run a generation to fill this space.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-2 border-foreground">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className={`bg-card ${idx !== images.length - 1 ? "border-b-2 md:border-b-2 md:border-r-2 lg:border-r-2 border-foreground" : ""} ${(idx + 1) % 3 !== 0 ? "lg:border-r-2 border-foreground" : ""} md:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(3n)]:border-r-0 md:[&:nth-child(2n+1)]:border-r-2 lg:[&:nth-child(3n+2)]:border-r-2`}
            >
              <div className="aspect-square overflow-hidden bg-muted border-b-2 border-foreground">
                <img
                  src={img.image_url}
                  alt={img.prompt}
                  className="w-full h-full object-cover block"
                />
              </div>
              <div className="p-4 space-y-2">
                <p className="text-sm line-clamp-2 text-foreground">{img.prompt}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{new Date(img.created_at).toLocaleDateString()}</span>
                  {img.seed !== null && img.seed !== undefined && <span>seed {img.seed}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
