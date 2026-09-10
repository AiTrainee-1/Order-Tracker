import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useOrdersList } from "../../hooks/useOrdersList";
import { useWorkflowStages } from "../../hooks/useWorkflowStages";
import { useStageChain, useCreateTxns, type NewTxn } from "../../hooks/useProductionChain";
import { STAGE } from "../../lib/chain";
import { stageQtyLabels } from "../../lib/stageLabels";
import { formatDisplayDate } from "../../lib/workflow";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Input, Select, Textarea } from "../../components/ui/FormControls";
import { FilterTabs } from "../../components/ui/FilterTabs";
import { Button } from "../../components/ui/Button";
import { Loader } from "../../components/ui/Loader";
import type { StageFormType } from "../../lib/types";

type JobWorkMode = "total" | "size";

const MODE_TABS: { key: JobWorkMode; label: string }[] = [
  { key: "total", label: "Total Count" },
  { key: "size", label: "Size-wise Count" },
];

/** Stages with no real production_txns ledger at all -  the 3 procurement
 * stages (which use material_entries instead) and the 2 confirmation-only
 * pass-throughs (order_confirmation, pattern_marker). "How many pieces did
 * job work produce for Order Confirmation" isn't a coherent question, so
 * these never appear in the section picker. */
const NO_LEDGER_FORM_TYPES = new Set<StageFormType>([
  "confirmation",
  "simple_confirm",
  "material_planning",
  "supplier_dc",
  "material_inward",
]);

/** Round-trip stages record their real output on txn_type 'receive' -  their
 * 'send' rows only ever carry qty_in (see chainForms.tsx's SEND_RECEIVE_COPY
 * and EmbroideryForm). Every other production stage records output on
 * 'process'. Mirrored exactly in migration 024's data migration. */
const ROUND_TRIP_STAGE_KEYS = new Set<string>([
  STAGE.knitting,
  STAGE.dyeing,
  STAGE.brushing,
  STAGE.compacting,
  STAGE.embroidery,
]);

/**
 * The Job Work user's own page: pick any order, pick any of the 14 stages
 * that actually track a production quantity, see that stage's numbers so far
 * as reference, then log an externally-manufactured quantity against it.
 *
 * The entry is a REAL production_txns row -  the same table and the same
 * chain.ts calculation every floor worker's own entry lands in, via the same
 * useCreateTxns() every stage form already uses (migration 024). It is
 * tagged is_job_work: true purely for provenance/display; chain.ts has no
 * idea the flag exists, so it counts toward that stage's actual output,
 * balance, and what the next stage inherits as available, exactly like an
 * in-house entry. It deliberately does NOT write a stage_entries row -  a Job
 * Work entry never marks a stage Forwarded/Complete or unlocks the next
 * assigned worker; that stays driven only by the assigned floor worker's own
 * actions.
 *
 * Reachable only with can_job_work (granted from Stage Roles); the nav item
 * is hidden without it, and this is the backstop if someone still types the
 * URL directly. The real backstop is server-side RLS (migration 024).
 */
export function JobWorkPage() {
  const { appUser } = useAuth();
  const toast = useToast();

  const ordersQuery = useOrdersList();
  const stagesQuery = useWorkflowStages();
  const stages = useMemo(
    () => (stagesQuery.data ?? []).filter((s) => !NO_LEDGER_FORM_TYPES.has(s.form_type)),
    [stagesQuery.data],
  );

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
  const stage = stages.find((s) => s.id === sectionId) ?? null;
  const canSizeWise = stage?.unit_type === "PCS";
  const effectiveMode: JobWorkMode = canSizeWise ? mode : "total";

  const stageChain = useStageChain(orderId || undefined, null, sectionId || undefined);
  const createTxns = useCreateTxns();

  const jobWorkTxns = useMemo(
    () => (stageChain.cs?.txns ?? []).filter((t) => t.is_job_work),
    [stageChain.cs],
  );
  const sectionTotal = jobWorkTxns.reduce((sum, t) => sum + (t.qty_out || t.qty_in), 0);

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

    const txnType = ROUND_TRIP_STAGE_KEYS.has(stage.key) ? "receive" : "process";
    const base = {
      order_id: order.id,
      po_id: null,
      section_id: stage.id,
      lot_id: null,
      txn_type: txnType,
      unit: stage.unit_type,
      qty_in: 0,
      qty_rejected: 0,
      qty_rework: 0,
      ref_name: vendor.trim(),
      doc_no: docNo.trim() || null,
      entry_date: date,
      notes: notes.trim(),
      entered_by: appUser.id,
      is_job_work: true,
    } as const;

    let rows: NewTxn[];
    if (effectiveMode === "total") {
      const qty = Number(totalQty) || 0;
      if (qty <= 0) {
        toast.error("Enter a quantity.");
        return;
      }
      rows = [{ ...base, size_code: null, qty_out: qty }];
    } else {
      rows = (stageChain.sizes ?? [])
        .map((s) => ({ ...base, size_code: s.size_code, qty_out: Number(sizeQty[s.size_code]) || 0 }))
        .filter((r) => r.qty_out > 0);
      if (rows.length === 0) {
        toast.error("Enter a quantity for at least one size.");
        return;
      }
    }

    try {
      await createTxns.mutateAsync(rows);
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
          Log a quantity manufactured outside the company for any order and any stage -  it's recorded
          as a real production entry, counted in that stage's actual output and everywhere else the
          app tracks quantity, exactly like an in-house entry. It never marks a stage complete or
          moves it forward -  that stays with the assigned floor worker.
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
            {stages.map((s) => (
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
              title={`${stage.label} -  so far`}
              subtitle="What's been recorded through the normal workflow AND job work, combined -  this is the stage's real total."
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
                  <RefStat label="Of which, Job Work" value={sectionTotal} unit={stage.unit_type} tone="amber" />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Add a job work entry"
              subtitle="Vendor, DC number and date, then the quantity -  as one total or size by size. Saved as a real entry for this stage."
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

              {canSizeWise && <FilterTabs tabs={MODE_TABS} value={mode} onChange={setMode} />}

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

              <Button onClick={handleSave} isLoading={createTxns.isPending}>
                Save Entry
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Job work entries so far"
              subtitle={`${sectionTotal.toLocaleString()} ${stage.unit_type} logged for ${stage.label} on this order.`}
            />
            <CardBody>
              {jobWorkTxns.length === 0 ? (
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
                      {jobWorkTxns.map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 py-1.5 text-ink-700">{formatDisplayDate(t.entry_date)}</td>
                          <td className="px-3 py-1.5 text-ink-700">{t.ref_name ?? "- "}</td>
                          <td className="px-3 py-1.5 text-ink-700">{t.doc_no ?? "- "}</td>
                          <td className="px-3 py-1.5 text-ink-700">{t.size_code ?? "Total"}</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-ink-900">
                            {(t.qty_out || t.qty_in).toLocaleString()}
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
