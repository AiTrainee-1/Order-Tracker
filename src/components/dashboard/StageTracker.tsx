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
          const isCurrent = index === currentStageIndex;
          const isSelected = index === selectedIndex;

          const dotClasses = isCompleted
            ? "bg-status-good border-status-good text-white"
            : isCurrent
              ? "bg-ink-900 border-ink-900 text-white"
              : "bg-white border-ink-300 text-ink-400";

          return (
            <div key={s.stage.id} className="flex items-center">
              <button
                onClick={() => onSelect(index)}
                className={`flex flex-col items-center gap-1.5 rounded-lg px-2 py-1 transition-colors ${
                  isSelected ? "bg-ink-100" : "hover:bg-ink-50"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold ${dotClasses}`}
                >
                  {isCompleted ? "✓" : index + 1}
                </span>
                <span className="w-20 text-center text-[11px] font-medium leading-tight text-ink-700">
                  {s.stage.label}
                </span>
              </button>
              {index < stages.length - 1 && (
                <div
                  className={`h-0.5 w-6 shrink-0 ${
                    isCompleted ? "bg-status-good" : "bg-ink-200"
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
