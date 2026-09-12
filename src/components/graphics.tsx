import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/* Пузырьковый градиентный вордмарк + искра */
export function PopLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="pop-gradient-text font-display text-2xl font-extrabold tracking-tight">
        gen42
      </span>
      <SparkStar className="h-5 w-5" />
    </span>
  );
}

/* Четырёхугольная искра — знак системы C */
export function SparkStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <path
        d="M24 4c1.4 10 5.2 15.6 6.6 17S37.2 22.6 44 24c-6.8 1.4-11.9 4-13.4 5.4S26.8 36 24 44c-1.4-10-5.2-15.6-6.6-17S10.8 25.4 4 24c6.8-1.4 11.9-4 13.4-5.4S21.2 12 24 4z"
        fill="#ffd54a"
      />
    </svg>
  );
}

/* Вспышка-салют для акцентов рядом с результатом */
export function StickerBurst({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <g stroke="#ffd54a" strokeWidth="3" strokeLinecap="round">
        <path d="M32 6v10M32 48v10M6 32h10M48 32h10M13 13l7 7M44 44l7 7M51 13l-7 7M20 44l-7 7" />
      </g>
      <circle cx="32" cy="32" r="7" fill="#ff5ca8" />
      <circle cx="32" cy="32" r="7" fill="url(#burst-shine)" />
      <defs>
        <radialGradient id="burst-shine" cx="0.35" cy="0.3" r="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/* Спираль-дудл для пустых состояний */
export function StickerSpiral({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M32 8c12 0 22 9 22 20 0 9.5-8 17-17.5 17S20 38 20 30.5 26.5 24 32.5 24c5 0 9 3.6 9 8s-3.6 7.5-7.5 7.5-6.5-2.8-6.5-5.8"
        stroke="#6c5cff"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Кольцо-орбита для фона Auth */
export function StickerRing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="20" stroke="#ff5ca8" strokeWidth="3" strokeDasharray="6 8" strokeLinecap="round" />
      <circle cx="32" cy="32" r="7" fill="#6c5cff" />
    </svg>
  );
}

/* Mesh-фон системы C */
export function MeshBackground({ className }: { className?: string }) {
  return <div className={cn("pop-mesh pointer-events-none absolute inset-0 -z-10", className)} aria-hidden="true" />;
}

/* «Холст ждёт» — пустое состояние генерации */
export function EmptyCanvasArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 180" fill="none" className={className} role="img" aria-label="Пустой холст ждёт первую картинку">
      <rect x="52" y="28" width="136" height="124" rx="20" fill="#16132e" stroke="#2b2652" strokeWidth="2" />
      <rect x="68" y="46" width="104" height="72" rx="12" fill="#1e1a3d" />
      <path
        d="M120 52c.9 6.4 3.3 10 4.2 10.9s4.2 1 10.6 1.9c-6.4.9-9.7 1-10.6 1.9s-3.3 4.5-4.2 10.9c-.9-6.4-3.3-10-4.2-10.9s-4.2-1-10.6-1.9c6.4-.9 9.7-1 10.6-1.9s3.3-4.5 4.2-10.9z"
        fill="#ffd54a"
      />
      <path
        d="M150 44c6 0 11 4.5 11 10 0 4.7-4 8.5-8.7 8.5S144 59 144 55.2 147.2 52 150 52c2.5 0 4.5 1.8 4.5 4s-1.8 3.7-3.7 3.7"
        stroke="#6c5cff"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="84" y="130" width="72" height="8" rx="4" fill="#2b2652" />
      <g stroke="#ff5ca8" strokeWidth="2.5" strokeLinecap="round">
        <path d="M36 60v8M32 64h8" />
        <path d="M204 110v8M200 114h8" />
      </g>
    </svg>
  );
}

/* Пустое состояние галереи — стопка кадров */
export function EmptyGalleryArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 180" fill="none" className={className} role="img" aria-label="В галерее пока пусто">
      <rect x="70" y="44" width="110" height="96" rx="18" fill="#1e1a3d" stroke="#2b2652" strokeWidth="2" transform="rotate(6 125 92)" />
      <rect x="60" y="38" width="110" height="96" rx="18" fill="#16132e" stroke="#6c5cff" strokeWidth="2" strokeOpacity="0.6" transform="rotate(-5 115 86)" />
      <path
        d="M115 62c1 7.3 3.8 11.4 4.8 12.5s4.8 1.1 12.1 2.1c-7.3 1-11.1 1.2-12.1 2.1s-3.8 5.2-4.8 12.5c-1-7.3-3.8-11.4-4.8-12.5s-4.8-1.1-12.1-2.1c7.3-1 11.1-1.2 12.1-2.1s3.8-5.2 4.8-12.5z"
        fill="#ffd54a"
      />
      <circle cx="150" cy="112" r="6" fill="#ff5ca8" />
    </svg>
  );
}

/* Спиннер-искра */
export function PopSpinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn("animate-pop-spin", className)} aria-hidden="true">
      <circle cx="24" cy="24" r="19" stroke="currentColor" strokeWidth="4" opacity="0.2" />
      <path d="M24 5a19 19 0 0 1 16.5 9.5" stroke="url(#pop-spin-g)" strokeWidth="4" strokeLinecap="round" />
      <defs>
        <linearGradient id="pop-spin-g" x1="0" y1="0" x2="48" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6c5cff" />
          <stop offset="1" stopColor="#ff5ca8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* Единый скелетон загрузки */
export function PopSkeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={cn("pop-skeleton", className)} style={style} aria-hidden="true" />;
}
