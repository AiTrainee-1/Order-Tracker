import { useMemo, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useToast } from "../../context/ToastContext";
import { useOrderDetail } from "../../hooks/useOrderDetail";
import { useProductionChain, useAuditLog } from "../../hooks/useProductionChain";
import { buildLotJourney, buildOutputSummary, buildSizeOutput, STAGE } from "../../lib/chain";
import { exportCsv, exportExcel, exportPdf } from "../../lib/reportExport";
import { formatDisplayDate } from "../../lib/workflow";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Loader } from "../../components/ui/Loader";
import { FilterTabs } from "../../components/ui/FilterTabs";
import { BackButton } from "../../components/ui/BackButton";
import { orderTrackingBasePath } from "../../lib/routing";
import { iconGradient, type IconTone } from "../../lib/theme";

/**
 * OUTPUT -  the whole order in one place.
 *
 * Everything here is derived, nothing is entered. It answers the two questions
 * the floor and the office actually argue about: how much did we ship against
 * what was ordered, and where did the rest go. Because every figure traces back
 * to a specific entry by a specific person, "where did it go" has an answer
 * rather than an estimate.
 */

const ALL_POS = "all";

const CHART_BLUE = "#155EEF";
const CHART_BLUE_LIGHT = "#7CA6FF";
const CHART_GREEN = "#12B76A";
const CHART_GREEN_LIGHT = "#6EE7B7";
const CHART_RED = "#F04438";
const CHART_AMBER = "#F79009";
const CHART_SLATE = "#CBD5E1";

/** Axis ticks in the tens of thousands are unreadable at 11px -  28,943 becomes
 * 28.9k and the axis stops fighting the bars for space. */
function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** Yield banding. A garment line losing 5% at one stage is a real problem, so
 * the thresholds are deliberately tight rather than a generic red/amber/green
 * spread across the whole 0-100 range. */
function yieldColor(pct: number): string {
  if (pct >= 98) return CHART_GREEN;
  if (pct >= 95) return CHART_AMBER;
  return CHART_RED;
}

export function OutputPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const basePath = orderTrackingBasePath(useLocation().pathname);
  const { order, purchaseOrders, usersById, isLoading, isError } = useOrderDetail(orderId);
  const [poScope, setPoScope] = useState<string>(ALL_POS);
  const [downloading, setDownloading] = useState<string | null>(null);
  /** Which half of the line the stage-flow chart is showing. KG and PCS cannot
   * share a Y axis without hiding one of them -  see flowRowsFor. */
  const [unitScope, setUnitScope] = useState<"KG" | "PCS">("PCS");
  const toast = useToast();

  const selectedPo = poScope === ALL_POS ? null : purchaseOrders.find((p) => p.id === poScope) ?? null;
  const { chain, isLoading: chainLoading } = useProductionChain({
    orderId,
    purchaseOrders,
    poId: selectedPo?.id ?? null,
  });
  const auditQuery = useAuditLog(orderId);

  const summary = useMemo(() => (chain ? buildOutputSummary(chain) : null), [chain]);
  const sizeRows = useMemo(() => (chain ? buildSizeOutput(chain) : []), [chain]);
  const lotJourneys = useMemo(
    () => (chain ? chain.lots.map((l) => buildLotJourney(l, chain)) : []),
    [chain],
  );

  if (isLoading || chainLoading) return <Loader full label="Building the production summary…" />;
  if (isError || !order || !chain || !summary) {
    return <p className="text-sm text-status-bad">Couldn't load this order's output.</p>;
  }

  const ctx = { order, po: selectedPo, chain, usersById };

  /** The export libraries are fetched on demand, so a download can take a
   * moment on a slow connection -  the button reports that rather than looking
   * like it did nothing. */
  async function download(kind: "csv" | "pdf" | "excel") {
    setDownloading(kind);
    try {
      if (kind === "csv") exportCsv(ctx);
      else if (kind === "pdf") await exportPdf(ctx);
      else await exportExcel(ctx);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the report.");
    } finally {
      setDownloading(null);
    }
  }

  /**
   * The stage flow, SPLIT BY UNIT.
   *
   * A single chart cannot honestly hold both: the fabric stages run in
   * hundreds of KG while the garment stages run in tens of thousands of
   * pieces, so on one linear axis every KG stage collapses to a flat line at
   * zero. Two charts on their own scales is the only way both halves are
   * actually readable.
   */
  const flowRowsFor = (unit: "KG" | "PCS") =>
    summary.rows
      .filter((r) => r.unit === unit)
      .map((r) => ({
        name: r.label.replace(/ \(.*\)/, ""),
        Input: r.input,
        Output: r.output,
        Shortage: r.shortage,
        Efficiency: r.efficiencyPct,
        unit: r.unit,
      }));

  const kgRows = flowRowsFor("KG");
  const pcsRows = flowRowsFor("PCS");
  const flowRows = unitScope === "KG" ? kgRows : pcsRows;

  /** Worst yield first -  the stage to go and ask about. */
  const efficiencyRows = summary.rows
    .filter((r) => r.efficiencyPct != null && r.input > 0)
    .map((r) => ({
      name: r.label.replace(/ \(.*\)/, ""),
      efficiency: r.efficiencyPct as number,
      unit: r.unit,
      lost: r.shortage + r.rejected,
    }))
    .sort((a, b) => a.efficiency - b.efficiency);

  /** The pipeline narrowing, in pieces -  the headline "how far has it got". */
  const sewnPcs = chain.byKey.get(STAGE.sewing)?.output ?? 0;
  const funnelSteps = [
    { label: "Ordered", value: summary.orderedPcs, color: CHART_BLUE },
    { label: "Cut", value: summary.cutPcs, color: "#7C3AED" },
    { label: "Sewn", value: sewnPcs, color: CHART_AMBER },
    { label: "Packed", value: summary.packedPcs, color: CHART_GREEN },
  ];

  const lotChartRows = lotJourneys
    .map((j) => ({
      name: j.lot.lot_no,
      Loss: j.totalLoss,
      Output: j.steps[j.steps.length - 1]?.qtyOut ?? 0,
    }))
    .slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton to={`${basePath}/orders/${order.id}`} label="Back to Order" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => download("csv")} isLoading={downloading === "csv"}>
            CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => download("pdf")} isLoading={downloading === "pdf"}>
            Download PDF
          </Button>
          <Button size="sm" onClick={() => download("excel")} isLoading={downloading === "excel"}>
            Download Excel
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Production Output</h1>
        <p className="text-sm text-ink-500">
          {order.style} · IO {order.io_no} · {selectedPo ? `PO ${selectedPo.po_number}` : "all POs combined"}
        </p>
      </div>

      {purchaseOrders.length > 0 && (
        <Card>
          <CardBody className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Scope</p>
            <FilterTabs
              value={poScope}
              onChange={setPoScope}
              tabs={[
                { key: ALL_POS, label: "All POs (combined)" },
                ...purchaseOrders.map((po) => ({ key: po.id, label: `PO ${po.po_number}` })),
              ]}
            />
          </CardBody>
        </Card>
      )}

      {/* ------------------------- Headline ------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeadlineCard label="Ordered" value={summary.orderedPcs} unit="PCS" icon="📋" tone="sky" />
        <HeadlineCard label="Cut" value={summary.cutPcs} unit="PCS" icon="✂️" tone="violet" />
        <HeadlineCard label="Packed" value={summary.packedPcs} unit="PCS" icon="📦" tone="emerald" />
        <HeadlineCard
          label="Short of order"
          value={summary.shortfallPcs}
          unit="PCS"
          icon={summary.shortfallPcs > 0 ? "⚠️" : "✅"}
          tone={summary.shortfallPcs > 0 ? "rose" : "emerald"}
        />
      </div>

      {/* ------------------------- Fulfillment donut ------------------------- */}
      <Card>
        <CardHeader
          title="Order fulfillment"
          subtitle="Packed pieces as a share of the order, with what's still owed alongside."
        />
        <CardBody>
          <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[220px_1fr]">
            <div className="relative mx-auto h-52 w-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    <linearGradient id="gradPacked" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={CHART_GREEN_LIGHT} />
                      <stop offset="100%" stopColor={CHART_GREEN} />
                    </linearGradient>
                  </defs>
                  <Pie
                    data={[
                      { name: "Packed", value: summary.packedPcs },
                      { name: "Remaining", value: summary.shortfallPcs },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="72%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    cornerRadius={8}
                    paddingAngle={summary.shortfallPcs > 0 && summary.packedPcs > 0 ? 3 : 0}
                  >
                    <Cell fill="url(#gradPacked)" />
                    <Cell fill={CHART_SLATE} />
                  </Pie>
                  <Tooltip
                    formatter={(value: number, key: string) => [`${value.toLocaleString()} PCS`, key]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-extrabold tabular-nums text-ink-900">
                  {summary.overallEfficiencyPct != null ? `${summary.overallEfficiencyPct}%` : "- "}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Packed</p>
              </div>
            </div>

            <div className="space-y-3">
              <StatRow dotColor={CHART_GREEN} label="Packed" value={summary.packedPcs} unit="PCS" />
              <StatRow dotColor={CHART_SLATE} label="Remaining against order" value={summary.shortfallPcs} unit="PCS" />
              <StatRow dotColor={CHART_RED} label="Rejected across garment stages" value={summary.totalRejectedPcs} unit="PCS" />
              <StatRow dotColor={CHART_AMBER} label="Fabric lost in processing" value={summary.fabricLossKg} unit="KG" />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ------------------------- Progress funnel ------------------------- */}
      <Card>
        <CardHeader
          title="How far the order has got"
          subtitle="Each step as a share of the ordered quantity, and what it dropped from the step before."
        />
        <CardBody className="space-y-2.5">
          {funnelSteps.map((step, i) => {
            const pct = summary.orderedPcs > 0 ? (step.value / summary.orderedPcs) * 100 : 0;
            const prev = i > 0 ? funnelSteps[i - 1].value : null;
            const drop = prev != null ? prev - step.value : null;
            return (
              <div key={step.label}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="font-semibold text-ink-800">{step.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-bold tabular-nums text-ink-900">
                      {step.value.toLocaleString()} PCS
                    </span>
                    <span className="tabular-nums text-ink-400">{Math.round(pct)}%</span>
                    {drop != null && drop > 0 && (
                      <span className="tabular-nums text-status-bad">−{drop.toLocaleString()}</span>
                    )}
                  </span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(pct, 0)}%`, backgroundColor: step.color }}
                  />
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      {/* ------------------------- Flow chart ------------------------- */}
      <Card>
        <CardHeader
          title="Input vs Output by stage"
          subtitle="What each stage received against what it sent on, with its yield. Fabric and garment stages are shown separately -  kilograms and pieces can't share a scale."
          action={
            <FilterTabs
              value={unitScope}
              onChange={(v) => setUnitScope(v as "KG" | "PCS")}
              tabs={[
                { key: "PCS", label: `Garment (PCS)${pcsRows.length ? "" : " -  none"}` },
                { key: "KG", label: `Fabric (KG)${kgRows.length ? "" : " -  none"}` },
              ]}
            />
          }
        />
        <CardBody>
          {flowRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">
              Nothing recorded yet for the {unitScope === "KG" ? "fabric" : "garment"} stages.
            </p>
          ) : (
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={flowRows} margin={{ top: 8, right: 12, left: 0, bottom: 60 }}>
                  <defs>
                    <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_BLUE_LIGHT} />
                      <stop offset="100%" stopColor={CHART_BLUE} />
                    </linearGradient>
                    <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_GREEN_LIGHT} />
                      <stop offset="100%" stopColor={CHART_GREEN} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    height={80}
                    tick={{ fontSize: 11, fill: "#667085" }}
                  />
                  <YAxis
                    yAxisId="qty"
                    tick={{ fontSize: 11, fill: "#667085" }}
                    tickFormatter={(v: number) => compactNumber(v)}
                  />
                  {/* Yield rides on its own 0-100 axis so a 97% line doesn't
                      vanish against a 28,000-piece bar. */}
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fontSize: 11, fill: "#98A2B3" }}
                  />
                  <Tooltip
                    formatter={(value: number, key: string, item) =>
                      key === "Efficiency"
                        ? [`${value}%`, "Yield"]
                        : [`${value.toLocaleString()} ${(item?.payload as { unit?: string })?.unit ?? ""}`, key]
                    }
                    contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="qty" dataKey="Input" fill="url(#gradInput)" radius={[4, 4, 0, 0]} maxBarSize={38} />
                  <Bar yAxisId="qty" dataKey="Output" fill="url(#gradOutput)" radius={[4, 4, 0, 0]} maxBarSize={38} />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="Efficiency"
                    name="Yield %"
                    stroke={CHART_AMBER}
                    strokeWidth={2}
                    dot={{ r: 3, fill: CHART_AMBER }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ------------------------- Yield by stage ------------------------- */}
      <Card>
        <CardHeader
          title="Yield by stage"
          subtitle="Output as a share of input, worst first -  the stage to go and ask about."
        />
        <CardBody>
          {efficiencyRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">Nothing measurable yet.</p>
          ) : (
            <div className="space-y-2">
              {efficiencyRows.map((r) => (
                <div key={r.name} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-xs font-medium text-ink-700" title={r.name}>
                    {r.name}
                  </span>
                  <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(Math.max(r.efficiency, 0), 100)}%`,
                        backgroundColor: yieldColor(r.efficiency),
                      }}
                    />
                  </div>
                  <span
                    className="w-14 shrink-0 text-right text-xs font-bold tabular-nums"
                    style={{ color: yieldColor(r.efficiency) }}
                  >
                    {r.efficiency}%
                  </span>
                  <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-ink-400">
                    {r.lost > 0 ? `−${r.lost.toLocaleString()} ${r.unit}` : "no loss"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ------------------------- Size-wise ------------------------- */}
      {/* The old "Where quantity was lost" bar chart lived here. It plotted KG
          shortage beside PCS shortage on one axis -  the same flaw as the flow
          chart -  and "Yield by stage" above now answers the same question
          honestly, with the absolute loss per stage in its right column. */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader
            title="Size-wise output"
            subtitle="Ordered → cut → packed per size, with the outstanding balance behind it."
          />
          <CardBody>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sizeRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="gradOrderedBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_BLUE_LIGHT} />
                      <stop offset="100%" stopColor={CHART_BLUE} />
                    </linearGradient>
                    <linearGradient id="gradCutBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FCD34D" />
                      <stop offset="100%" stopColor={CHART_AMBER} />
                    </linearGradient>
                    <linearGradient id="gradPackedBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_GREEN_LIGHT} />
                      <stop offset="100%" stopColor={CHART_GREEN} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                  <XAxis dataKey="sizeCode" tick={{ fontSize: 11, fill: "#667085" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickFormatter={(v: number) => compactNumber(v)} />
                  <Tooltip
                    formatter={(value: number, key: string) => [`${value.toLocaleString()} PCS`, key]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ordered" name="Ordered" fill="url(#gradOrderedBar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="cut" name="Cut" fill="url(#gradCutBar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="packed" name="Packed" fill="url(#gradPackedBar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="balance" name="Outstanding" fill={CHART_SLATE} radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ------------------------- Stage table ------------------------- */}
      <Card>
        <CardHeader
          title="Stage-by-stage comparison"
          subtitle="The full reconciliation, from the yarn plan to the packed carton."
        />
        <CardBody>
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2.5 text-left font-semibold">Stage</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Unit</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Input</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Output</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Rejected</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Shortage</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {summary.rows.map((r) => (
                  <tr key={r.key} className={`bg-white ${r.key === STAGE.cutting ? "border-t-2 border-t-brand/30" : ""}`}>
                    <td className="px-3 py-2.5 font-medium text-ink-900">{r.label}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={r.unit === "KG" ? "neutral" : "brand"}>{r.unit}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.input.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-status-good">
                      {r.output.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-status-bad">
                      {r.rejected ? r.rejected.toLocaleString() : "- "}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                        r.shortage > 0 ? "text-amber-600" : "text-ink-400"
                      }`}
                    >
                      {r.shortage ? r.shortage.toLocaleString() : "- "}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.efficiencyPct != null ? `${r.efficiencyPct}%` : "- "}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* ------------------------- Size table ------------------------- */}
      <Card>
        <CardHeader title="Size-wise reconciliation" subtitle="Ordered → cut → sewn → packed, per size." />
        <CardBody>
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2.5 text-left font-semibold">Size</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Ordered</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Cut</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Sewn</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Packed</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {sizeRows.map((s) => (
                  <tr key={s.sizeCode} className="bg-white">
                    <td className="px-3 py-2.5 font-semibold text-ink-900">{s.sizeCode}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.ordered.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.cut.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.sewn.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-status-good">
                      {s.packed.toLocaleString()}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                        s.balance > 0 ? "text-amber-600" : "text-status-good"
                      }`}
                    >
                      {s.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* ------------------------- Lot traceability ------------------------- */}
      {lotJourneys.length > 0 && (
        <Card>
          <CardHeader
            title="Lot traceability"
            subtitle="Every lot, every stage it passed through, and what it lost on the way."
          />
          <CardBody className="space-y-5">
            {lotChartRows.length > 0 && (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lotChartRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#667085" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Output" fill={CHART_GREEN} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Loss" fill={CHART_RED} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="space-y-3">
              {lotJourneys.map((j) => (
                <details key={j.lot.id} className="rounded-xl border border-ink-100 bg-white">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className="text-sm font-bold text-ink-900">{j.lot.lot_no}</span>
                    <span className="text-xs text-ink-500">
                      {j.steps.length} stage{j.steps.length === 1 ? "" : "s"}
                    </span>
                    {j.totalLoss > 0 && <Badge tone="warn">{j.totalLoss.toLocaleString()} lost</Badge>}
                  </summary>
                  <div className="overflow-x-auto border-t border-ink-100">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                          <th className="px-3 py-2 text-left font-semibold">Stage</th>
                          <th className="px-3 py-2 text-right font-semibold">In</th>
                          <th className="px-3 py-2 text-right font-semibold">Out</th>
                          <th className="px-3 py-2 text-right font-semibold">Rejected</th>
                          <th className="px-3 py-2 text-right font-semibold">Loss</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {j.steps.map((s) => (
                          <tr key={s.stage.id}>
                            <td className="px-3 py-2 font-medium text-ink-800">
                              {s.stage.label}{" "}
                              <span className="text-[10px] font-normal text-ink-400">{s.unit}</span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{s.qtyIn.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-status-good">
                              {s.qtyOut.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-status-bad">
                              {s.qtyRejected.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{s.loss.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ------------------------- Audit ------------------------- */}
      <Card>
        <CardHeader
          title="Activity & audit trail"
          subtitle="Every create, update and deletion -  who, when, and why."
        />
        <CardBody>
          {(auditQuery.data?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No recorded activity yet.</p>
          ) : (
            <ol className="divide-y divide-ink-100">
              {(auditQuery.data ?? []).slice(0, 40).map((row) => (
                <li key={row.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                  <Badge
                    tone={row.action === "create" ? "good" : row.action === "delete" ? "warn" : "info"}
                  >
                    {row.action}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-800">{row.summary}</p>
                    {row.changes && (
                      <p className="text-xs text-ink-500">
                        {Object.entries(row.changes)
                          .map(([f, c]) => `${f.replace(/_/g, " ")}: ${String(c.from ?? "- ")} → ${String(c.to ?? "- ")}`)
                          .join(" · ")}
                      </p>
                    )}
                    {row.notes && <p className="text-xs italic text-ink-500">"{row.notes}"</p>}
                  </div>
                  <p className="whitespace-nowrap text-xs text-ink-400">
                    {usersById.get(row.user_id)?.name ?? "- "} ·{" "}
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <p className="pb-4 text-center text-xs text-ink-400">
        Report generated {formatDisplayDate(new Date().toISOString().slice(0, 10))} · every figure
        above is derived from the recorded entries.
      </p>
    </div>
  );
}

function HeadlineCard({
  label,
  value,
  unit,
  icon,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  icon: string;
  tone: IconTone;
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg shadow-md"
          style={iconGradient[tone]}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
          <p className="text-2xl font-extrabold tabular-nums text-ink-900">{value.toLocaleString()}</p>
          <p className="text-[11px] font-medium text-ink-400">{unit}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function StatRow({
  dotColor,
  label,
  value,
  unit,
}: {
  dotColor: string;
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2.5 last:border-0 last:pb-0">
      <span className="flex min-w-0 items-center gap-2 text-sm text-ink-600">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums text-ink-900">
        {value.toLocaleString()} <span className="text-xs font-medium text-ink-400">{unit}</span>
      </span>
    </div>
  );
}
