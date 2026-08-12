import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAllOrderProgress, type OrderBundle } from "../../hooks/useOrders";
import { useUsers } from "../../hooks/useUsers";
import { publicImageUrl } from "../../lib/supabaseClient";
import { formatDisplayDate } from "../../lib/workflow";
import type { StageProgress } from "../../lib/progress";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Loader } from "../../components/ui/Loader";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";
import { cardStatusAccent, cardStatusSoftBg, type CardStatusTone } from "../../lib/theme";

/**
 * A live-tracking-style view of the whole production run: pick an order from
 * the horizontal strip up top, then watch it travel across every stage below.
 * The order list and per-stage progress both come from the same
 * useAllOrderProgress bundle the Dashboard already uses -  this page is a
 * different way of looking at the same data, not a second source of truth.
 */
export function WorkflowMapPage() {
  const { bundles, isLoading } = useAllOrderProgress();
  const usersQuery = useUsers();
  const navigate = useNavigate();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const usersById = useMemo(() => new Map((usersQuery.data ?? []).map((u) => [u.id, u])), [usersQuery.data]);
  const nameOf = (id: string) => usersById.get(id)?.name ?? "Unknown";

  const started = useMemo(() => bundles.filter((b) => b.progress.hasStarted), [bundles]);
  const selected = started.find((b) => b.order.id === selectedOrderId) ?? started[0] ?? null;

  if (isLoading) return <Loader full label="Loading orders…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Workflow Map</h1>
        <p className="text-sm text-ink-500">
          Pick an order below to watch it travel across the full production workflow.
        </p>
      </div>

      {started.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-ink-400">
            No orders have started production yet.
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="scrollbar-thin flex snap-x gap-3 overflow-x-auto pb-2">
            {started.map((b) => (
              <OrderChip
                key={b.order.id}
                bundle={b}
                selected={b.order.id === selected?.order.id}
                onClick={() => setSelectedOrderId(b.order.id)}
              />
            ))}
          </div>

          {selected && (
            <Card>
              <CardHeader
                title={selected.order.style}
                subtitle={`IO ${selected.order.io_no} · ${selected.progress.completedStagesCount}/${selected.progress.stages.length} stages complete · Delivery ${formatDisplayDate(selected.order.delivery_date)}`}
              />
              <CardBody>
                <WorkflowJourneyMap
                  stages={selected.progress.stages}
                  currentStageIndex={selected.progress.currentStageIndex}
                  onSelectStage={(stage) => navigate(`/md/workflow-map/${selected.order.id}/${stage.stage.key}`)}
                  nameOf={nameOf}
                />
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function cardTone(progress: OrderBundle["progress"]): CardStatusTone {
  if (progress.completedStagesCount >= progress.stages.length && progress.stages.length > 0) return "completed";
  if (progress.completedStagesCount > 0) return "started";
  return "notStarted";
}

function OrderChip({ bundle, selected, onClick }: { bundle: OrderBundle; selected: boolean; onClick: () => void }) {
  const { order, progress } = bundle;
  const imageUrl = publicImageUrl(order.image_path);
  const tone = cardTone(progress);

  return (
    <button
      type="button"
      onClick={onClick}
      style={cardStatusSoftBg[tone]}
      className={`flex shrink-0 snap-start items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all ${
        selected
          ? "border-brand shadow-[0_10px_24px_-10px_rgba(21,94,239,0.5)] ring-2 ring-brand/40"
          : "border-white/70 hover:-translate-y-0.5"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
        {imageUrl ? (
          <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
        ) : (
          <GarmentPlaceholder className="h-5 w-5 text-ink-500" />
        )}
      </div>
      <div className="min-w-0">
        <p className="max-w-[9rem] truncate text-xs font-bold text-ink-900">{order.style}</p>
        <p className="max-w-[9rem] truncate text-[11px] text-ink-500">
          {progress.overallProgressPct}% · IO {order.io_no}
        </p>
      </div>
      <span className="ml-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cardStatusAccent[tone] }} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// The journey map itself -  a zigzag row of stage icons (GIFs you drop into
// public/assets/workflow/, one per stage key -  see StageIcon below) connected
// by arrows. A connector plays flow-complete.gif when the order has fully
// crossed that stage, flow-partial.gif when it moved on without finishing,
// and shows a plain static arrow -  no animation -  wherever the order hasn't
// reached yet.
// ---------------------------------------------------------------------------

type MarkerTone = "crossed" | "current" | "partial" | "pending";
type ConnectorTone = "completed" | "partial" | "idle";

function markerTone(stage: StageProgress, isCurrent: boolean): MarkerTone {
  if (stage.isCompleted) return "crossed";
  if (stage.isPartial) return "partial";
  if (isCurrent) return "current";
  return "pending";
}

/** The connector FROM a stage takes its tone from that stage's own state -
 * completed (fully crossed), partial (moved on unfinished), or idle (the
 * order hasn't reached that hand-off yet). */
function connectorTone(stage: StageProgress): ConnectorTone {
  if (stage.isCompleted) return "completed";
  if (stage.isPartial) return "partial";
  return "idle";
}

const BADGE_CLASSES: Record<MarkerTone, string> = {
  crossed: "bg-good-gradient text-white",
  current: "bg-brand-gradient text-white",
  partial: "bg-warn-gradient text-white",
  pending: "bg-white text-ink-400 ring-2 ring-inset ring-ink-200",
};

const COLS = 4;
const NODE = 88; // px -  icon tile size
const NODE_ROW = 132; // px -  icon + number badge + two-line label
const GAP_TRACK = 56; // px -  connector track between nodes

/**
 * The order's path through production, laid out as a zigzag grid of stage
 * icons -  the same snake pattern GameLevelPath uses, but rendering real
 * (GIF) icons and animated connectors instead of colored bubbles.
 */
function WorkflowJourneyMap({
  stages,
  currentStageIndex,
  onSelectStage,
  nameOf,
}: {
  stages: StageProgress[];
  currentStageIndex: number;
  onSelectStage: (stage: StageProgress) => void;
  nameOf: (id: string) => string;
}) {
  const rows = Math.ceil(stages.length / COLS);

  const positions = stages.map((_, i) => {
    const row = Math.floor(i / COLS);
    const colInRow = i % COLS;
    const reversed = row % 2 === 1;
    const visualCol = reversed ? COLS - 1 - colInRow : colInRow;
    return { row, visualCol };
  });

  const connectors = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const a = positions[i];
    const b = positions[i + 1];
    const tone = connectorTone(stages[i]);
    if (a.row === b.row) {
      connectors.push({
        key: `c-${i}`,
        column: 2 * Math.min(a.visualCol, b.visualCol) + 2,
        row: 2 * a.row + 1,
        vertical: false,
        pointsRight: b.visualCol > a.visualCol,
        tone,
      });
    } else {
      connectors.push({
        key: `c-${i}`,
        column: 2 * a.visualCol + 1,
        row: 2 * a.row + 2,
        vertical: true,
        pointsRight: true,
        tone,
      });
    }
  }

  const columnTemplate = Array.from({ length: COLS }, (_, i) => (i < COLS - 1 ? `${NODE}px 1fr` : `${NODE}px`)).join(" ");
  const rowTemplate = Array.from({ length: rows }, (_, i) => (i < rows - 1 ? `${NODE_ROW}px ${GAP_TRACK}px` : `${NODE_ROW}px`)).join(" ");

  return (
    <div className="space-y-3">
      <div
        className="scrollbar-thin overflow-x-auto rounded-[1.75rem] border border-white/70 p-5"
        style={{
          backgroundImage:
            "radial-gradient(at 10% 20%, rgba(21,94,239,0.06) 0px, transparent 45%), radial-gradient(at 90% 80%, rgba(34,197,94,0.06) 0px, transparent 45%), linear-gradient(180deg, #FBFCFF 0%, #F3F5FC 100%)",
        }}
      >
        <div
          className="grid min-w-max"
          style={{ gridTemplateColumns: columnTemplate, gridTemplateRows: rowTemplate }}
        >
          {connectors.map((c) => (
            <div
              key={c.key}
              style={{ gridColumn: c.column, gridRow: c.row }}
              className="relative z-0 flex items-center justify-center self-center justify-self-center"
            >
              <ConnectorFlow tone={c.tone} vertical={c.vertical} pointsRight={c.pointsRight} />
            </div>
          ))}
          {stages.map((stage, index) => {
            const isCurrent = index === currentStageIndex;
            const tone = markerTone(stage, isCurrent);
            const { row, visualCol } = positions[index];
            return (
              <div
                key={stage.stage.id}
                style={{ gridColumn: 2 * visualCol + 1, gridRow: 2 * row + 1 }}
                className="relative z-10 flex justify-self-center"
              >
                <button
                  type="button"
                  onClick={() => onSelectStage(stage)}
                  className="group flex flex-col items-center gap-1.5"
                  title={stage.stage.label}
                >
                  <span className="relative flex items-center justify-center transition-transform group-hover:-translate-y-1 group-hover:scale-105">
                    <StageIcon stageKey={stage.stage.key} size={NODE} />
                    <span
                      className={`absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-white ${BADGE_CLASSES[tone]} ${tone === "current" ? "animate-pulseSoft" : ""}`}
                    >
                      {tone === "crossed" ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </span>
                    {tone === "partial" && (
                      <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-amber-500" />
                    )}
                  </span>
                  <span className="w-24 text-center text-[11px] font-semibold leading-tight text-ink-700">
                    {stage.stage.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-500">
        <LegendDot className="bg-good-gradient" label="Crossed" />
        <LegendDot className="bg-brand-gradient" label="Current" />
        <LegendDot className="bg-warn-gradient" label="Moved on, not finished" />
        <LegendDot className="bg-white ring-1 ring-inset ring-ink-300" label="Not reached" />
      </div>

      {stages[currentStageIndex] && (
        <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
          Currently at <b>{stages[currentStageIndex].stage.label}</b>
          {stages[currentStageIndex].lastActorId
            ? ` · last touched by ${nameOf(stages[currentStageIndex].lastActorId!)}`
            : ""}
          . Tap any point on the map to see that section's details.
        </p>
      )}
    </div>
  );
}

/**
 * One stage's icon -  a GIF at /assets/workflow/<stage_key>.gif, dropped in by
 * hand (see the Workflow Map section of the README). Falls back to a plain
 * placeholder tile until that file exists, exactly the way BrandMark falls
 * back when the company logo is missing -  so the page works today and picks
 * up real icons the moment they're added, with no code change.
 */
function StageIcon({ stageKey, size }: { stageKey: string; size: number }) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <img
        src={`/assets/workflow/${stageKey}.gif`}
        alt=""
        onError={() => setFailed(true)}
        className="shrink-0 rounded-2xl border border-white bg-white object-contain p-1.5 shadow-[0_10px_22px_-12px_rgba(30,41,90,0.35)]"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white text-2xl shadow-[0_10px_22px_-12px_rgba(30,41,90,0.25)]"
      style={{ width: size, height: size }}
    >
      📦
    </div>
  );
}

/**
 * The connecting line between two stages. Completed and partial segments play
 * their matching GIF (rotated for a vertical hand-off); an idle segment -  the
 * order hasn't reached it yet -  is a plain static arrow with no animation.
 */
function ConnectorFlow({ tone, vertical, pointsRight }: { tone: ConnectorTone; vertical: boolean; pointsRight: boolean }) {
  const [failed, setFailed] = useState(false);
  const gifSrc = tone === "completed" ? "/assets/workflow/flow-complete.gif" : "/assets/workflow/flow-partial.gif";
  const arrow = vertical ? "↓" : pointsRight ? "→" : "←";

  if (tone !== "idle" && !failed) {
    return (
      <div className={`relative flex items-center justify-center ${vertical ? "h-full w-10" : "h-10 w-full"}`}>
        <img
          src={gifSrc}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
          style={vertical ? { transform: "rotate(90deg)" } : undefined}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center text-ink-300 ${vertical ? "h-full w-10" : "h-10 w-full"}`}>
      <span className={`text-lg ${tone !== "idle" ? "text-ink-400" : "text-ink-300"}`}>{arrow}</span>
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
