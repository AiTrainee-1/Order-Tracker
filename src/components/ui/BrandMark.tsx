export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[999px] bg-gradient-to-br from-sky-400 to-blue-600 font-serif font-bold text-white shadow-lg shadow-blue-500/30"
      style={{ width: size * 1.5, height: size, fontSize: size * 0.4 }}
    >
      UKT
    </div>
  );
}
