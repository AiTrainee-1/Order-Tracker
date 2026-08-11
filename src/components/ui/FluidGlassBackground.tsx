import { useEffect, useRef } from "react";

/**
 * CSS-only stand-in for the WebGL "FluidGlass" effect (react-bits' lens mode):
 * a large frosted blob that eases toward the pointer -  damped, not 1:1
 * tracking, the same "it takes a beat to catch up" feel the three.js version
 * has -  plus two slow ambient blobs drifting behind it. No three.js, no GLB
 * models, no GPU scene: just backdrop-blur, a radial gradient, and a rAF loop
 * nudging one element's position. Keyframes are inlined in a <style> tag
 * rather than added to tailwind.config.ts, since this project's Tailwind
 * config doesn't hot-reload new keyframes reliably (see lib/theme.ts).
 */
export function FluidGlassBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 68, y: 38 });
  const current = useRef({ x: 68, y: 38 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const lens = lensRef.current;
    if (!container || !lens) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lens.style.left = `${current.current.x}%`;
    lens.style.top = `${current.current.y}%`;

    if (reduceMotion) return;

    function handlePointerMove(e: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      target.current = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
    }

    function tick() {
      current.current.x += (target.current.x - current.current.x) * 0.055;
      current.current.y += (target.current.y - current.current.y) * 0.055;
      lens!.style.left = `${current.current.x}%`;
      lens!.style.top = `${current.current.y}%`;
      raf.current = requestAnimationFrame(tick);
    }

    container.addEventListener("pointermove", handlePointerMove);
    raf.current = requestAnimationFrame(tick);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes fluidDrift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(4%, -6%) scale(1.08); }
        }
        @keyframes fluidDrift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-5%, 5%) scale(1.05); }
        }
      `}</style>

      {/* Slow ambient blobs -  the "fluid" part, independent of the pointer. */}
      <span
        className="absolute left-[6%] top-[62%] h-72 w-72 rounded-full bg-sky-300/25 blur-3xl"
        style={{ animation: "fluidDrift1 19s ease-in-out infinite" }}
      />
      <span
        className="absolute right-[4%] top-[8%] h-80 w-80 rounded-full bg-violet-300/25 blur-3xl"
        style={{ animation: "fluidDrift2 23s ease-in-out infinite" }}
      />

      {/* The lens -  eases toward the pointer, refracting whatever sits behind it. */}
      <div
        ref={lensRef}
        className="absolute h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-80 sm:w-80"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.4) 28%, rgba(96,165,250,0.22) 55%, rgba(167,139,250,0.16) 78%, transparent 100%)",
          backdropFilter: "blur(22px) saturate(160%)",
          WebkitBackdropFilter: "blur(22px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.65)",
          boxShadow:
            "0 30px 70px -24px rgba(30,41,90,0.35), inset 0 0 50px rgba(255,255,255,0.45), inset 0 0 0 10px rgba(56,189,248,0.05), inset 0 0 0 22px rgba(217,70,239,0.04)",
        }}
      />
    </div>
  );
}
