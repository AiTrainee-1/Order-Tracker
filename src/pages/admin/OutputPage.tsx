import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

export function OutputPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { order, purchaseOrders, usersById, isLoading, isError } = useOrderDetail(orderId);
  const [poScope, setPoScope] = useState<string>(ALL_POS);
  const [downloading, setDownloading] = useState<string | null>(null);
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

  const flowRows = summary.rows.map((r) => ({
    name: r.label.replace(/ \(.*\)/, ""),
    Input: r.input,
    Output: r.output,
    Shortage: r.shortage,
    unit: r.unit,
  }));

  const shortageRows = summary.rows
    .filter((r) => r.shortage > 0)
    .map((r) => ({ name: r.label, shortage: r.shortage, unit: r.unit }));

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
        <BackButton to={`/admin/orders/${order.id}`} label="Back to Order" />
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

      {/* ------------------------- Flow chart ------------------------- */}
      <Card>
        <CardHeader
          title="Input vs Output by stage"
          subtitle="What each stage received against what it sent on. The gap is process loss and rejection."
        />
        <CardBody>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowRows} margin={{ top: 8, right: 8, left: 0, bottom: 60 }}>
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
                <YAxis tick={{ fontSize: 11, fill: "#667085" }} />
                <Tooltip
                  formatter={(value: number, key: string, item) => [
                    `${value.toLocaleString()} ${(item?.payload as { unit?: string })?.unit ?? ""}`,
                    key,
                  ]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Input" fill="url(#gradInput)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Output" fill="url(#gradOutput)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {/* ------------------------- Shortage ------------------------- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Where quantity was lost" subtitle="Shortage by stage, largest first." />
          <CardBody>
            {shortageRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-400">
                No shortage recorded -  every stage passed on what it received.
              </p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...shortageRows].sort((a, b) => b.shortage - a.shortage)}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#667085" }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fontSize: 11, fill: "#667085" }}
                    />
                    <Tooltip
                      formatter={(value: number, _k, item) => [
                        `${value.toLocaleString()} ${(item?.payload as { unit?: string })?.unit ?? ""}`,
                        "Shortage",
                      ]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }}
                    />
                    <Bar dataKey="shortage" radius={[0, 4, 4, 0]}>
                      {shortageRows.map((r) => (
                        <Cell key={r.name} fill={r.unit === "KG" ? CHART_AMBER : CHART_RED} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Size-wise output" subtitle="Ordered against packed, size by size." />
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
                  <YAxis tick={{ fontSize: 11, fill: "#667085" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EAECF0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ordered" name="Ordered" fill="url(#gradOrderedBar)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cut" name="Cut" fill="url(#gradCutBar)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="packed" name="Packed" fill="url(#gradPackedBar)" radius={[4, 4, 0, 0]} />
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
