import type { StageProgress } from "../../lib/progress";

export function StageTracker({
  stages,
  currentStageIndex,
  selectedIndex,
  onSelect,
}: {
  stages: StageProgress[];
  currentStageIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="scrollbar-thin overflow-x-auto pb-2">
      <div className="flex min-w-max items-center">
        {stages.map((s, index) => {
          const isCompleted = s.isCompleted;
          const isCurrent = index === currentStageIndex && !isCompleted;
          const isSelected = index === selectedIndex;

          const dotClasses = isCompleted
            ? "bg-good-gradient border-transparent text-white"
            : isCurrent
              ? "bg-brand-gradient border-transparent text-white shadow-glow"
              : "bg-white border-ink-300 text-ink-400";

          return (
            <div key={s.stage.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onSelect(index)}
                className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-1.5 transition-colors ${
                  isSelected ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-ink-50"
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-transform ${dotClasses} ${
                    isCurrent ? "scale-110 animate-pulseSoft" : ""
                  }`}
                >
                  {isCompleted ? "✓" : index + 1}
                </span>
                <span
                  className={`w-20 text-center text-[11px] font-medium leading-tight ${
                    isSelected ? "text-indigo-700" : "text-ink-700"
                  }`}
                >
                  {s.stage.label}
                </span>
              </button>
              {index < stages.length - 1 && (
                <div
                  className={`h-0.5 w-6 shrink-0 rounded-full ${
                    isCompleted ? "bg-good-gradient" : "bg-ink-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
