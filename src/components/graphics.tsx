export function ApertureMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="2.5" />
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M24 10 L33 26" />
        <path d="M36.5 15.5 L30 33.5" />
        <path d="M38 24 L22 33" />
        <path d="M36.5 32.5 L19.5 26" />
        <path d="M24 38 L15 22" />
        <path d="M11.5 32.5 L18 14.5" />
        <path d="M10 24 L26 15" />
        <path d="M11.5 15.5 L28.5 22" />
      </g>
      <circle cx="24" cy="24" r="5.5" fill="currentColor" />
    </svg>
  );
}

export function DevelopingSpinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={`animate-spin ${className}`} aria-hidden="true">
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path
        d="M24 4 a20 20 0 0 1 17.32 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
    </svg>
  );
}

export function FrameCorners({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 8 V4.5 A1.5 1.5 0 0 1 4.5 3 H8" />
        <path d="M16 3 h3.5 A1.5 1.5 0 0 1 21 4.5 V8" />
        <path d="M21 16 v3.5 a1.5 1.5 0 0 1 -1.5 1.5 H16" />
        <path d="M8 21 H4.5 A1.5 1.5 0 0 1 3 19.5 V16" />
      </g>
    </svg>
  );
}

export function Perforations({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="h-3 w-2 rounded-[2px] border border-border/70 bg-background/60"
        />
      ))}
    </div>
  );
}
