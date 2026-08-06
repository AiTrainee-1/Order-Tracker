import { useMemo } from "react";
import type { StageProgress } from "../../lib/progress";
import { formatDisplayDate } from "../../lib/workflow";

const COLS = 7;
const NODE = 34; // px — compact circle size
const NODE_ROW = 64; // px — node + label
const LINE_ROW = 18; // px — vertical connector between rows

interface GameLevelPathProps {
  stages: StageProgress[];
  currentStageIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/** A compact "game level" path — stages snake left-to-right, then right-to-left
 * on the next row, like a board game track. Nodes sit on a CSS grid with
 * dedicated connector tracks between them, so the connecting lines always
 * span the real gap between nodes exactly (no more floating disconnected
 * stubs when the card is wider than the content). Desktop/tablet get the
 * grid; mobile collapses to a vertical timeline. */
export function GameLevelPath({ stages, currentStageIndex, selectedIndex, onSelect }: GameLevelPathProps) {
  const rows = Math.ceil(stages.length / COLS);

  const positions = useMemo(
    () =>
      stages.map((_, i) => {
        const row = Math.floor(i / COLS);
        const colInRow = i % COLS;
        const reversed = row % 2 === 1;
        const visualCol = reversed ? COLS - 1 - colInRow : colInRow;
        return { row, visualCol };
      }),
    [stages],
  );

  const connectors = useMemo(() => {
    const list: { column: number; row: number; vertical: boolean; tone: "good" | "warn" | "idle" }[] = [];
    for (let i = 0; i < stages.length - 1; i++) {
      const a = positions[i];
      const b = positions[i + 1];
      const tone = stages[i].isCompleted ? "good" : i + 1 === currentStageIndex ? "warn" : "idle";
      if (a.row === b.row) {
        list.push({ column: 2 * Math.min(a.visualCol, b.visualCol) + 2, row: 2 * a.row + 1, vertical: false, tone });
      } else {
        list.push({ column: 2 * a.visualCol + 1, row: 2 * a.row + 2, vertical: true, tone });
      }
    }
    return list;
  }, [stages, positions, currentStageIndex]);

  const connectorTone: Record<"good" | "warn" | "idle", string> = {
    good: "bg-good-gradient",
    warn: "bg-warn-gradient",
    idle: "bg-ink-200",
  };

  const columnTemplate = Array.from({ length: COLS }, (_, i) => (i < COLS - 1 ? `${NODE}px 1fr` : `${NODE}px`)).join(" ");
  const rowTemplate = Array.from({ length: rows }, (_, i) => (i < rows - 1 ? `${NODE_ROW}px ${LINE_ROW}px` : `${NODE_ROW}px`)).join(" ");

  return (
    <div className="rounded-xl border border-ink-100 bg-blue-50/40 p-3">
      {/* Desktop / tablet: snake grid */}
      <div
        className="hidden md:grid"
        style={{ gridTemplateColumns: columnTemplate, gridTemplateRows: rowTemplate }}
      >
        {connectors.map((c, i) => (
          <div
            key={`c-${i}`}
            style={{ gridColumn: c.column, gridRow: c.row }}
            className={`self-center justify-self-center rounded-full ${connectorTone[c.tone]} ${
              c.vertical ? "h-full w-1.5" : "h-1.5 w-full"
            }`}
          />
        ))}
        {stages.map((stage, index) => {
          const { row, visualCol } = positions[index];
          return (
            <div
              key={stage.stage.id}
              style={{ gridColumn: 2 * visualCol + 1, gridRow: 2 * row + 1 }}
              className="relative z-10 flex justify-self-center"
            >
              <LevelNode
                stage={stage}
                index={index}
                isCurrent={index === currentStageIndex && !stage.isCompleted}
                isSelected={index === selectedIndex}
                onClick={() => onSelect(index)}
              />
            </div>
          );
        })}
      </div>

      {/* Mobile: compact vertical timeline */}
      <div className="space-y-0 md:hidden">
        {stages.map((stage, index) => (
          <div key={stage.stage.id} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <LevelNode
                stage={stage}
                index={index}
                isCurrent={index === currentStageIndex && !stage.isCompleted}
                isSelected={index === selectedIndex}
                onClick={() => onSelect(index)}
                compact
              />
              {index < stages.length - 1 && (
                <div className={`h-6 w-1 rounded-full ${stage.isCompleted ? "bg-good-gradient" : "bg-ink-200"}`} />
              )}
            </div>
            <div className="flex-1 pb-5 pt-1.5">
              <p className={`text-xs font-semibold ${index === selectedIndex ? "text-brand" : "text-ink-800"}`}>
                {stage.stage.label}
              </p>
              <p className="text-[11px] text-ink-500">
                {stage.isCompleted ? "Completed" : index === currentStageIndex ? "In progress" : "Pending"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LevelNode({
  stage,
  index,
  isCurrent,
  isSelected,
  onClick,
  compact = false,
}: {
  stage: StageProgress;
  index: number;
  isCurrent: boolean;
  isSelected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const nodeClasses = stage.isCompleted
    ? "bg-good-gradient text-white border-2 border-white"
    : isCurrent
      ? "bg-brand-gradient text-white border-2 border-white animate-pulseSoft"
      : "bg-white text-ink-600 border border-ink-200";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center gap-1"
    >
      <span
        className={`relative flex ${compact ? "h-9 w-9" : ""} shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-card transition-transform group-hover:-translate-y-0.5 ${nodeClasses} ${
          isSelected ? "ring-2 ring-brand/40 ring-offset-1" : ""
        }`}
        style={!compact ? { height: NODE, width: NODE } : undefined}
      >
        {stage.isCompleted ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          index + 1
        )}
        {isCurrent && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-amber-400 text-[7px] text-white shadow-card" />
        )}
      </span>
      {!compact && (
        <span
          className={`w-16 truncate text-center text-[10px] font-medium leading-tight ${
            isSelected ? "text-brand" : "text-ink-600"
          }`}
        >
          {stage.stage.label}
        </span>
      )}

      <StageTooltip stage={stage} />
    </button>
  );
}

function StageTooltip({ stage }: { stage: StageProgress }) {
  const unit = stage.stage.unit_type;
  const status = stage.isCompleted ? "Completed" : stage.entries.length ? "In progress" : "Pending";

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-52 -translate-x-1/2 rounded-lg border border-ink-100 bg-white p-3 text-left opacity-0 shadow-popover transition-opacity duration-100 group-hover:opacity-100 md:block">
      <p className="text-xs font-semibold text-ink-900">{stage.stage.label}</p>
      <p className="mt-0.5 text-[11px] font-medium text-ink-500">{status}</p>
      <div className="mt-2 space-y-1 text-[11px] text-ink-600">
        <div className="flex items-center justify-between">
          <span>Forwarded</span>
          <span className="font-semibold text-ink-900">
            {stage.qtyForwarded.toLocaleString()} {unit}
          </span>
        </div>
        {stage.qtyShortage > 0 && (
          <div className="flex items-center justify-between text-status-shortage">
            <span>Shortage</span>
            <span className="font-semibold">{stage.qtyShortage.toLocaleString()}</span>
          </div>
        )}
        {stage.qtyRejected > 0 && (
          <div className="flex items-center justify-between text-status-rejected">
            <span>Rejected</span>
            <span className="font-semibold">{stage.qtyRejected.toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span>Last update</span>
          <span className="font-medium text-ink-800">{formatDisplayDate(stage.lastEntryDate)}</span>
        </div>
      </div>
      <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-ink-100 bg-white" />
    </div>
  );
}
