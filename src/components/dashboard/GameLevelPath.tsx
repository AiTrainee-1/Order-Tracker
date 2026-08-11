import { useMemo } from "react";
import type { StageProgress } from "../../lib/progress";
import { formatDisplayDate } from "../../lib/workflow";

const COLS = 7;
const NODE = 34; // px -  compact circle size
const NODE_ROW = 64; // px -  node + label
const LINE_ROW = 18; // px -  vertical connector between rows

/** Completed, moved-on-but-unfinished (orange), or still to do. */
type StageTone = "good" | "partial" | "current" | "idle";

function toneOf(stage: StageProgress, isCurrent: boolean): StageTone {
  if (stage.isCompleted) return "good";
  if (stage.isPartial) return "partial";
  return isCurrent ? "current" : "idle";
}

interface GameLevelPathProps {
  stages: StageProgress[];
  currentStageIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Resolves an entry's author id to a display name for the tooltip. */
  userNameById?: (id: string) => string;
}

/**
 * A compact "game level" path -  stages snake left-to-right, then right-to-left
 * on the next row, like a board game track. Nodes sit on a CSS grid with
 * dedicated connector tracks between them, so the connecting lines always span
 * the real gap between nodes. Colour carries the status: green = completed,
 * orange = forwarded without finishing (balance still owed), blue = in
 * progress, grey = not reached.
 */
export function GameLevelPath({
  stages,
  currentStageIndex,
  selectedIndex,
  onSelect,
  userNameById,
}: GameLevelPathProps) {
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
    const list: { column: number; row: number; vertical: boolean; tone: StageTone }[] = [];
    for (let i = 0; i < stages.length - 1; i++) {
      const a = positions[i];
      const b = positions[i + 1];
      // The line takes the colour of the stage it leaves -  an orange line means
      // goods moved on from a stage that isn't finished yet.
      const tone: StageTone = stages[i].isCompleted
        ? "good"
        : stages[i].isPartial
          ? "partial"
          : "idle";
      if (a.row === b.row) {
        list.push({ column: 2 * Math.min(a.visualCol, b.visualCol) + 2, row: 2 * a.row + 1, vertical: false, tone });
      } else {
        list.push({ column: 2 * a.visualCol + 1, row: 2 * a.row + 2, vertical: true, tone });
      }
    }
    return list;
  }, [stages, positions]);

  const connectorTone: Record<StageTone, string> = {
    good: "bg-good-gradient",
    partial: "bg-warn-gradient",
    current: "bg-brand-gradient",
    idle: "bg-ink-200",
  };

  const columnTemplate = Array.from({ length: COLS }, (_, i) => (i < COLS - 1 ? `${NODE}px 1fr` : `${NODE}px`)).join(" ");
  const rowTemplate = Array.from({ length: rows }, (_, i) => (i < rows - 1 ? `${NODE_ROW}px ${LINE_ROW}px` : `${NODE_ROW}px`)).join(" ");

  const hasPartial = stages.some((s) => s.isPartial);

  return (
    <div className="space-y-3">
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
                  tone={toneOf(stage, index === currentStageIndex)}
                  isSelected={index === selectedIndex}
                  onClick={() => onSelect(index)}
                  userNameById={userNameById}
                />
              </div>
            );
          })}
        </div>

        {/* Mobile: compact vertical timeline */}
        <div className="space-y-0 md:hidden">
          {stages.map((stage, index) => {
            const tone = toneOf(stage, index === currentStageIndex);
            return (
              <div key={stage.stage.id} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <LevelNode
                    stage={stage}
                    index={index}
                    tone={tone}
                    isSelected={index === selectedIndex}
                    onClick={() => onSelect(index)}
                    userNameById={userNameById}
                    compact
                  />
                  {index < stages.length - 1 && (
                    <div
                      className={`h-6 w-1 rounded-full ${
                        connectorTone[stage.isCompleted ? "good" : stage.isPartial ? "partial" : "idle"]
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1 pb-5 pt-1.5">
                  <p className={`text-xs font-semibold ${index === selectedIndex ? "text-brand" : "text-ink-800"}`}>
                    {stage.stage.label}
                  </p>
                  <p className="text-[11px] text-ink-500">{statusLine(stage, tone, userNameById)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-500">
        <LegendDot className="bg-good-gradient" label="Completed" />
        <LegendDot className="bg-warn-gradient" label="Moved on -  not completed" />
        <LegendDot className="bg-brand-gradient" label="In progress" />
        <LegendDot className="bg-white ring-1 ring-inset ring-ink-300" label="Not reached" />
      </div>

      {hasPartial && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Orange stages were forwarded before they were finished -  a balance is still owed there.
          They stay flagged until someone completes them.
        </p>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

/** One-line status, including who finished it and when. */
function statusLine(
  stage: StageProgress,
  tone: StageTone,
  userNameById?: (id: string) => string,
): string {
  if (tone === "good") {
    const who = stage.completedBy ? userNameById?.(stage.completedBy) : null;
    const when = stage.completedOn ? formatDisplayDate(stage.completedOn) : null;
    if (who && when) return `Completed by ${who} · ${when}`;
    if (when) return `Completed ${when}`;
    return "Completed";
  }
  if (tone === "partial") {
    const who = stage.lastActorId ? userNameById?.(stage.lastActorId) : null;
    const when = stage.lastEntryDate ? formatDisplayDate(stage.lastEntryDate) : null;
    const base = `Moved on, not completed${who ? ` · ${who}` : ""}${when ? ` · ${when}` : ""}`;
    return base;
  }
  if (tone === "current") return "In progress";
  return "Pending";
}

function LevelNode({
  stage,
  index,
  tone,
  isSelected,
  onClick,
  userNameById,
  compact = false,
}: {
  stage: StageProgress;
  index: number;
  tone: StageTone;
  isSelected: boolean;
  onClick: () => void;
  userNameById?: (id: string) => string;
  compact?: boolean;
}) {
  const nodeClasses: Record<StageTone, string> = {
    good: "bg-good-gradient text-white border-2 border-white",
    partial: "bg-warn-gradient text-white border-2 border-white",
    current: "bg-brand-gradient text-white border-2 border-white animate-pulseSoft",
    idle: "bg-white text-ink-600 border-2 border-ink-200",
  };

  return (
    <button type="button" onClick={onClick} className="group relative flex flex-col items-center gap-1">
      <span
        className={`relative flex ${compact ? "h-9 w-9" : ""} shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-card transition-transform group-hover:-translate-y-0.5 ${nodeClasses[tone]} ${
          isSelected ? "ring-2 ring-brand/40 ring-offset-1" : ""
        }`}
        style={!compact ? { height: NODE, width: NODE } : undefined}
      >
        {tone === "good" ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          index + 1
        )}
        {/* Half-filled marker: goods went on, but this stage isn't closed. */}
        {tone === "partial" && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-amber-600 text-[8px] font-bold text-white shadow-card">
            !
          </span>
        )}
        {tone === "current" && (
          <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border border-white bg-amber-400 shadow-card" />
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

      <StageTooltip stage={stage} tone={tone} userNameById={userNameById} />
    </button>
  );
}

function StageTooltip({
  stage,
  tone,
  userNameById,
}: {
  stage: StageProgress;
  tone: StageTone;
  userNameById?: (id: string) => string;
}) {
  const unit = stage.stage.unit_type;

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-60 -translate-x-1/2 rounded-lg border border-ink-100 bg-white p-3 text-left opacity-0 shadow-popover transition-opacity duration-100 group-hover:opacity-100 md:block">
      <p className="text-xs font-semibold text-ink-900">{stage.stage.label}</p>
      <p
        className={`mt-0.5 text-[11px] font-medium ${
          tone === "good" ? "text-green-700" : tone === "partial" ? "text-amber-700" : "text-ink-500"
        }`}
      >
        {statusLine(stage, tone, userNameById)}
      </p>

      <div className="mt-2 space-y-1 text-[11px] text-ink-600">
        <Row label={`Allotted (${unit})`} value={stage.qtyAllotted.toLocaleString()} />
        <Row label="Forwarded" value={stage.qtyForwarded.toLocaleString()} strong />
        {stage.qtyPending > 0 && (
          <Row label="Still owed" value={stage.qtyPending.toLocaleString()} className="text-amber-700" />
        )}
        {stage.qtyShortage > 0 && (
          <Row label="Shortage" value={stage.qtyShortage.toLocaleString()} className="text-status-shortage" />
        )}
        {stage.qtyRejected > 0 && (
          <Row label="Rejected" value={stage.qtyRejected.toLocaleString()} className="text-status-rejected" />
        )}
        <Row label="Records" value={String(stage.entries.length)} />
        <Row label="Last update" value={formatDisplayDate(stage.lastEntryDate)} />
      </div>

      {stage.unitBreakdown.length > 0 && (
        <div className="mt-2 border-t border-ink-100 pt-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Split across</p>
          {stage.unitBreakdown.slice(0, 3).map((u) => (
            <p key={u.unitName} className="mt-0.5 flex justify-between text-[11px] text-ink-600">
              <span className="truncate pr-2">{u.unitName}</span>
              <span className="font-medium text-ink-800">{u.qtyForwarded.toLocaleString()}</span>
            </p>
          ))}
          {stage.unitBreakdown.length > 3 && (
            <p className="mt-0.5 text-[10px] text-ink-400">+{stage.unitBreakdown.length - 3} more</p>
          )}
        </div>
      )}

      <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-ink-100 bg-white" />
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  className = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span>{label}</span>
      <span className={strong ? "font-semibold text-ink-900" : "font-medium"}>{value}</span>
    </div>
  );
}
