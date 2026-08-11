import type { CSSProperties } from "react";

/**
 * Shared surface styling for the frosted-glass look used across the app.
 *
 * These are plain inline styles rather than Tailwind theme tokens on purpose:
 * a custom key in tailwind.config.ts silently disappears until the dev server
 * reloads its config, and a background quietly failing to paint is how you end
 * up with unreadable text. Colours that only tint (never carry legibility) can
 * stay as Tailwind classes; anything structural lives here.
 */

/** Sign-in backdrop -  the fullest expression of the mesh. */
export const authBackground: CSSProperties = {
  backgroundColor: "#EEF3FF",
  backgroundImage: [
    "radial-gradient(at 12% 8%, rgba(56,189,248,0.34) 0px, transparent 55%)",
    "radial-gradient(at 88% 12%, rgba(167,139,250,0.34) 0px, transparent 50%)",
    "radial-gradient(at 78% 88%, rgba(244,114,182,0.28) 0px, transparent 55%)",
    "radial-gradient(at 22% 92%, rgba(45,212,191,0.24) 0px, transparent 50%)",
  ].join(", "),
};

/** In-app backdrop -  same palette, dialled back so dense tables stay crisp. */
export const appBackground: CSSProperties = {
  backgroundColor: "#F3F6FD",
  backgroundImage: [
    "radial-gradient(at 8% 4%, rgba(56,189,248,0.20) 0px, transparent 45%)",
    "radial-gradient(at 92% 6%, rgba(167,139,250,0.18) 0px, transparent 42%)",
    "radial-gradient(at 85% 92%, rgba(244,114,182,0.14) 0px, transparent 45%)",
    "radial-gradient(at 10% 96%, rgba(45,212,191,0.14) 0px, transparent 42%)",
  ].join(", "),
  backgroundAttachment: "fixed",
};

/** Sidebar backdrop -  a vertical tint so the rail reads apart from the canvas. */
export const sidebarBackground: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(238,243,255,0.88) 55%, rgba(243,232,255,0.85) 100%)",
};

/** Diagonal highlight laid over a glass panel so it catches light. */
export const glassSheen: CSSProperties = {
  backgroundImage:
    "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.25) 45%, rgba(255,255,255,0.6) 100%)",
};

/** Primary action gradient: brand blue running into violet. */
export const brandGradient: CSSProperties = {
  backgroundImage: "linear-gradient(120deg, #0B3FAE 0%, #155EEF 45%, #7C3AED 100%)",
};

/** Same ramp, for text via bg-clip-text. */
export const headingGradient: CSSProperties = {
  backgroundImage: "linear-gradient(100deg, #155EEF 0%, #7C3AED 55%, #DB2777 100%)",
};

export const dangerGradient: CSSProperties = {
  backgroundImage: "linear-gradient(120deg, #B91C1C 0%, #EF4444 100%)",
};

export type IconTone = "sky" | "amber" | "emerald" | "violet" | "rose" | "slate";

/** Gradient tiles for stat/feature icons. */
export const iconGradient: Record<IconTone, CSSProperties> = {
  sky: { backgroundImage: "linear-gradient(135deg, #38BDF8 0%, #2563EB 100%)" },
  amber: { backgroundImage: "linear-gradient(135deg, #FBBF24 0%, #F97316 100%)" },
  emerald: { backgroundImage: "linear-gradient(135deg, #34D399 0%, #0D9488 100%)" },
  violet: { backgroundImage: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)" },
  rose: { backgroundImage: "linear-gradient(135deg, #FB7185 0%, #E11D48 100%)" },
  slate: { backgroundImage: "linear-gradient(135deg, #94A3B8 0%, #475569 100%)" },
};

/** Faint dot texture layered over a backdrop. */
export const dotTexture: CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgba(16,24,40,0.10) 1px, transparent 1px)",
  backgroundSize: "26px 26px",
};

// Shadow recipes as arbitrary-value Tailwind classes. These literals live here
// so Tailwind's scanner finds them -  note each variant (including the hover:
// form) must be spelled out in full, because a class assembled at runtime like
// `hover:${SHADOW}` is invisible to the extractor and would never be generated.
export const SHADOW_GLASS = "shadow-[0_10px_30px_-14px_rgba(30,41,90,0.35)]";
export const SHADOW_GLASS_HOVER = "hover:shadow-[0_18px_44px_-16px_rgba(30,41,90,0.45)]";
export const SHADOW_PANEL =
  "shadow-[0_30px_70px_-20px_rgba(30,41,90,0.45),0_8px_24px_-12px_rgba(30,41,90,0.25)]";
export const SHADOW_BRAND = "shadow-[0_12px_30px_-8px_rgba(21,94,239,0.55)]";

/** Standard frosted card surface. */
export const GLASS_CARD =
  "rounded-2xl border border-white/70 bg-white/80 backdrop-blur-xl " + SHADOW_GLASS;
