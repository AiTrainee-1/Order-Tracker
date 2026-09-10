import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useOrdersList } from "../../hooks/useOrdersList";
import { useWorkflowStages } from "../../hooks/useWorkflowStages";
import { useStageChain } from "../../hooks/useProductionChain";
import { useJobWorkEntries, useCreateJobWorkEntry, type NewJobWorkEntry } from "../../hooks/useJobWork";
import { buildJobWorkSummary } from "../../lib/jobWork";
import { stageQtyLabels } from "../../lib/stageLabels";
import { formatDisplayDate } from "../../lib/workflow";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Input, Select, Textarea } from "../../components/ui/FormControls";
import { FilterTabs } from "../../components/ui/FilterTabs";
import { Button } from "../../components/ui/Button";
import { Loader } from "../../components/ui/Loader";
import type { JobWorkMode } from "../../lib/types";

const MODE_TABS: { key: JobWorkMode; label: string }[] = [
  { key: "total", label: "Total Count" },
  { key: "size", label: "Size-wise Count" },
];

/**
 * The Job Work user's own page: pick any order, pick any of the 19 stages,
 * see that stage's in-house numbers as reference only, then log an
 * externally-manufactured quantity against it -  entirely separate from the
 * in-house production chain (migration 023, src/lib/jobWork.ts). Nothing
 * here writes to production_txns or affects stage gating; Output & Reports
 * is where these quantities get folded into the order's final totals.
 *
 * Reachable only with can_job_work (granted from Stage Roles); the nav item
 * is hidden without it, and this is the backstop if someone still types the
 * URL directly. The real backstop is server-side RLS (migration 023).
 */
export function JobWorkPage() {
  const { appUser } = useAuth();
  const toast = useToast();

  const ordersQuery = useOrdersList();
  const stagesQuery = useWorkflowStages();

  const [orderId, setOrderId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [mode, setMode] = useState<JobWorkMode>("total");
  const [vendor, setVendor] = useState("");
  const [docNo, setDocNo] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [totalQty, setTotalQty] = useState("");
  const [sizeQty, setSizeQty] = useState<Record<string, string>>({});

  const order = ordersQuery.data?.orders.find((o) => o.id === orderId) ?? null;
  const stage = stagesQuery.data?.find((s) => s.id === sectionId) ?? null;
  const canSizeWise = stage?.unit_type === "PCS";
  const effectiveMode: JobWorkMode = canSizeWise ? mode : "total";

  const stageChain = useStageChain(orderId || undefined, null, sectionId || undefined);
  const jobWorkQuery = useJobWorkEntries(orderId || undefined);
  const createEntry = useCreateJobWorkEntry();

  const jobWork = useMemo(() => buildJobWorkSummary(jobWorkQuery.data ?? []), [jobWorkQuery.data]);
  const sectionEntries = useMemo(
    () => (jobWorkQuery.data ?? []).filter((e) => e.section_id === sectionId),
    [jobWorkQuery.data, sectionId],
  );
  const sectionTotal = sectionId ? (jobWork.totalBySection.get(sectionId) ?? 0) : 0;

  if (!appUser?.can_job_work) {
    return <Navigate to="/user/home" replace />;
  }

  const labels = stage ? stageQtyLabels(stage.key) : null;

  function resetForm() {
    setVendor("");
    setDocNo("");
    setNotes("");
    setTotalQty("");
    setSizeQty({});
  }

  async function handleSave() {
    if (!appUser || !order || !stage) return;
    if (!vendor.trim()) {
      toast.error("Enter a vendor name.");
      return;
    }
    if (!notes.trim()) {
      toast.error("Add a note for this entry.");
      return;
    }

    const base = {
      order_id: order.id,
      po_id: null,
      section_id: stage.id,
      unit: stage.unit_type,
      vendor_name: vendor.trim(),
      doc_no: docNo.trim() || null,
      entry_date: date,
      notes: notes.trim(),
      entered_by: appUser.id,
    };

    let rows: NewJobWorkEntry[];
    if (effectiveMode === "total") {
      const qty = Number(totalQty) || 0;
      if (qty <= 0) {
        toast.error("Enter a quantity.");
        return;
      }
      rows = [{ ...base, mode: "total", size_code: null, qty }];
    } else {
      rows = (stageChain.sizes ?? [])
        .map((s) => ({ ...base, mode: "size" as const, size_code: s.size_code, qty: Number(sizeQty[s.size_code]) || 0 }))
        .filter((r) => r.qty > 0);
      if (rows.length === 0) {
        toast.error("Enter a quantity for at least one size.");
        return;
      }
    }

    try {
      await createEntry.mutateAsync(rows);
      toast.success(`${vendor.trim()}: job work recorded for ${stage.label}.`);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the entry.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Job Work</h1>
        <p className="text-sm text-ink-500">
          Log a quantity manufactured outside the company for any order and any stage -  kept separate
          from in-house production, and rolled into the order's final totals on Output & Reports.
        </p>
      </div>

      <Card>
        <CardHeader title="Order & section" subtitle="Pick what this job work entry is against." />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Order"
            value={orderId}
            onChange={(e) => {
              setOrderId(e.target.value);
              setSectionId("");
            }}
          >
            <option value="">Choose an order…</option>
            {(ordersQuery.data?.orders ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                IO {o.io_no} · {o.style} {o.color ? `· ${o.color}` : ""}
              </option>
            ))}
          </Select>
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={!orderId}
          >
            <option value="">Choose a section…</option>
            {(stagesQuery.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.unit_type})
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      {order && stage && (
        <>
          <Card>
            <CardHeader
              title={`${stage.label} -  in-house so far`}
              subtitle="Reference only. This is what's already been recorded through the normal 19-stage workflow -  it isn't affected by anything entered here."
            />
            <CardBody>
              {stageChain.isLoading ? (
                <Loader label="Loading this stage's numbers…" />
              ) : !stageChain.cs ? (
                <p className="text-sm text-ink-400">Nothing recorded here yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <RefStat label={labels?.in ?? "Input"} value={stageChain.cs.input} unit={stage.unit_type} />
                  <RefStat label={labels?.out ?? "Output"} value={stageChain.cs.output} unit={stage.unit_type} />
                  <RefStat label={labels?.balance ?? "Balance"} value={stageChain.cs.balance} unit={stage.unit_type} />
                  <RefStat label="Job Work so far" value={sectionTotal} unit={stage.unit_type} tone="amber" />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Add a job work entry"
              subtitle="Vendor, DC number and date, then the quantity -  as one total or size by size."
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  label="Vendor Name"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="Unit / vendor name"
                />
                <Input label="DC Name" value={docNo} onChange={(e) => setDocNo(e.target.value)} />
                <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              {canSizeWise && (
                <FilterTabs tabs={MODE_TABS} value={mode} onChange={setMode} />
              )}

              {effectiveMode === "total" ? (
                <Input
                  label={`Quantity (${stage.unit_type})`}
                  type="number"
                  min={0}
                  value={totalQty}
                  onChange={(e) => setTotalQty(e.target.value)}
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-ink-100 bg-white">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                        <th className="px-3 py-2 text-left font-semibold">Size</th>
                        <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {(stageChain.sizes ?? []).map((s) => (
                        <tr key={s.size_code}>
                          <td className="px-3 py-1.5 font-semibold text-ink-900">{s.size_code}</td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              value={sizeQty[s.size_code] ?? ""}
                              onChange={(e) =>
                                setSizeQty((prev) => ({ ...prev, [s.size_code]: e.target.value }))
                              }
                              className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm outline-none focus:border-brand"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Textarea
                label="Notes"
                required
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Kept with this entry"
              />

              <Button onClick={handleSave} isLoading={createEntry.isPending}>
                Save Entry
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Entries so far"
              subtitle={`${sectionTotal.toLocaleString()} ${stage.unit_type} logged for ${stage.label} on this order.`}
            />
            <CardBody>
              {sectionEntries.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">Nothing recorded here yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-ink-100 bg-white">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                        <th className="px-3 py-2 text-left font-semibold">Date</th>
                        <th className="px-3 py-2 text-left font-semibold">Vendor</th>
                        <th className="px-3 py-2 text-left font-semibold">DC</th>
                        <th className="px-3 py-2 text-left font-semibold">Size</th>
                        <th className="px-3 py-2 text-right font-semibold">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {sectionEntries.map((e) => (
                        <tr key={e.id}>
                          <td className="px-3 py-1.5 text-ink-700">{formatDisplayDate(e.entry_date)}</td>
                          <td className="px-3 py-1.5 text-ink-700">{e.vendor_name ?? "- "}</td>
                          <td className="px-3 py-1.5 text-ink-700">{e.doc_no ?? "- "}</td>
                          <td className="px-3 py-1.5 text-ink-700">{e.size_code ?? "Total"}</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-ink-900">
                            {e.qty.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function RefStat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone?: "amber";
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${tone === "amber" ? "text-amber-600" : "text-ink-900"}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] font-medium text-ink-400">{unit}</p>
    </div>
  );
}
