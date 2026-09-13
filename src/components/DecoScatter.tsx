import {
  DecoStar6,
  DecoStar5,
  DecoStar8,
  DecoStarOutline,
  DecoHeart,
  DecoHeartOutline,
  DecoDiamond,
  DecoDiamondOutline,
  DecoCircle,
  DecoCircleOutline,
  DecoRing,
  DecoHexagon,
  DecoTriangle,
  DecoTriangleOutline,
  DecoCross,
  DecoLightning,
  DecoMoon,
  DecoCloud,
  DecoWave,
  DecoZigzag,
  DecoSpiral,
  DecoDots3,
  DecoLines3,
  DecoSquare,
  DecoOval,
  DecoArrowUp,
  DecoFlower,
  DecoInfinity,
  DecoExcl,
  DecoQuestion,
} from "./graphics-bg";
import { cn } from "@/lib/utils";

type Item = {
  el: React.ComponentType<{ className?: string }>;
  x: string;
  y: string;
  size: string;
  anim: string;
  delay?: string;
  rotate?: string;
  opacity?: string;
};

const items: Item[] = [
  { el: DecoStar6, x: "5%", y: "8%", size: "w-5 h-5", anim: "animate-drift-1", delay: "0s", opacity: "opacity-30" },
  { el: DecoStar5, x: "88%", y: "12%", size: "w-4 h-4", anim: "animate-drift-2", delay: "1.2s", opacity: "opacity-25" },
  { el: DecoStar8, x: "15%", y: "35%", size: "w-6 h-6", anim: "animate-pulse-deco", delay: "0.5s", opacity: "opacity-20" },
  { el: DecoStarOutline, x: "78%", y: "28%", size: "w-7 h-7", anim: "animate-drift-3", delay: "2s", rotate: "rotate-12", opacity: "opacity-20" },
  { el: DecoHeart, x: "92%", y: "45%", size: "w-5 h-5", anim: "animate-drift-1", delay: "0.8s", opacity: "opacity-25" },
  { el: DecoHeartOutline, x: "8%", y: "55%", size: "w-6 h-6", anim: "animate-drift-4", delay: "1.5s", rotate: "-rotate-6", opacity: "opacity-20" },
  { el: DecoDiamond, x: "25%", y: "15%", size: "w-4 h-4", anim: "animate-pulse-deco", delay: "3s", opacity: "opacity-20" },
  { el: DecoDiamondOutline, x: "70%", y: "60%", size: "w-5 h-5", anim: "animate-drift-2", delay: "0.3s", opacity: "opacity-25" },
  { el: DecoCircle, x: "45%", y: "5%", size: "w-3 h-3", anim: "animate-drift-3", delay: "2.5s", opacity: "opacity-15" },
  { el: DecoCircleOutline, x: "60%", y: "70%", size: "w-6 h-6", anim: "animate-drift-1", delay: "1.8s", opacity: "opacity-20" },
  { el: DecoRing, x: "3%", y: "75%", size: "w-8 h-8", anim: "animate-spin-slow", delay: "0s", opacity: "opacity-15" },
  { el: DecoHexagon, x: "82%", y: "80%", size: "w-7 h-7", anim: "animate-drift-4", delay: "1s", opacity: "opacity-15" },
  { el: DecoTriangle, x: "50%", y: "88%", size: "w-5 h-5", anim: "animate-drift-2", delay: "2.2s", rotate: "rotate-18", opacity: "opacity-20" },
  { el: DecoTriangleOutline, x: "12%", y: "85%", size: "w-4 h-4", anim: "animate-pulse-deco", delay: "0.7s", opacity: "opacity-20" },
  { el: DecoCross, x: "35%", y: "92%", size: "w-4 h-4", anim: "animate-drift-1", delay: "1.4s", opacity: "opacity-20" },
  { el: DecoLightning, x: "65%", y: "15%", size: "w-5 h-5", anim: "animate-drift-3", delay: "0.4s", rotate: "rotate-12", opacity: "opacity-25" },
  { el: DecoMoon, x: "40%", y: "20%", size: "w-6 h-6", anim: "animate-drift-4", delay: "2.8s", opacity: "opacity-20" },
  { el: DecoCloud, x: "20%", y: "65%", size: "w-10 h-7", anim: "animate-drift-1", delay: "1.6s", opacity: "opacity-10" },
  { el: DecoWave, x: "55%", y: "40%", size: "w-12 h-3", anim: "animate-drift-2", delay: "0.9s", opacity: "opacity-15" },
  { el: DecoZigzag, x: "85%", y: "50%", size: "w-10 h-3", anim: "animate-drift-3", delay: "2.4s", opacity: "opacity-15" },
  { el: DecoSpiral, x: "30%", y: "50%", size: "w-5 h-5", anim: "animate-spin-slow", delay: "0.6s", opacity: "opacity-20" },
  { el: DecoDots3, x: "75%", y: "35%", size: "w-8 h-3", anim: "animate-drift-4", delay: "1.1s", opacity: "opacity-20" },
  { el: DecoLines3, x: "10%", y: "42%", size: "w-8 h-5", anim: "animate-drift-1", delay: "3.2s", opacity: "opacity-15" },
  { el: DecoSquare, x: "48%", y: "65%", size: "w-4 h-4", anim: "animate-drift-2", delay: "0.2s", rotate: "rotate-45", opacity: "opacity-15" },
  { el: DecoOval, x: "90%", y: "70%", size: "w-8 h-5", anim: "animate-drift-3", delay: "1.7s", opacity: "opacity-10" },
  { el: DecoArrowUp, x: "5%", y: "90%", size: "w-4 h-4", anim: "animate-drift-4", delay: "2.6s", opacity: "opacity-20" },
  { el: DecoFlower, x: "95%", y: "25%", size: "w-6 h-6", anim: "animate-pulse-deco", delay: "0.1s", opacity: "opacity-20" },
  { el: DecoInfinity, x: "38%", y: "78%", size: "w-10 h-5", anim: "animate-drift-1", delay: "1.3s", opacity: "opacity-15" },
  { el: DecoExcl, x: "72%", y: "90%", size: "w-3 h-5", anim: "animate-drift-2", delay: "2.9s", opacity: "opacity-20" },
  { el: DecoQuestion, x: "18%", y: "22%", size: "w-4 h-5", anim: "animate-drift-3", delay: "0.8s", opacity: "opacity-15" },
];

export function DecoScatter({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)} aria-hidden="true">
      {items.map((item, i) => {
        const El = item.el;
        return (
          <span
            key={i}
            className={cn(
              "absolute",
              item.x,
              item.y,
              item.size,
              item.anim,
              item.rotate,
              item.opacity,
            )}
            style={{ animationDelay: item.delay }}
          >
            <El className="h-full w-full" />
          </span>
        );
      })}
    </div>
  );
}
