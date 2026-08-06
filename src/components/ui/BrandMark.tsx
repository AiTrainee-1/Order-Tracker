import { useState } from "react";

/** Renders the real company logo from /public/UKT_Company_Logo.png, falling
 * back to a gradient initials badge if the file is ever missing. */
export function BrandMark({ size = 44 }: { size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <img
        src="/UKT_Company_Logo.png"
        alt="UK Textiles"
        onError={() => setFailed(true)}
        className="shrink-0 object-contain"
        style={{ width: size * 1.5, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-brand-gradient font-serif font-bold text-white shadow-card"
      style={{ width: size * 1.5, height: size, fontSize: size * 0.4 }}
    >
      UKT
    </div>
  );
}
