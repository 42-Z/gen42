import React, { useState, useEffect } from "react";

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
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Gallery</h2>

      {images.length === 0 ? (
        <p className="text-gray-500">No images generated yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {images.map((img) => (
            <div key={img.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <img
                src={img.image_url}
                alt={img.prompt}
                className="w-full h-48 object-cover"
              />
              <div className="p-4">
                <p className="text-sm text-gray-600 truncate">{img.prompt}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(img.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
