import { useMemo } from "react";
import type { StageProgress } from "../../lib/progress";
import { buildLotJourney, type ChainStage, type ProductionChain } from "../../lib/chain";
import { lotStatus } from "../../components/forms/stage/chainForms";
import { ChainStrip, LotSummaryTable, SizeSummaryTable } from "../../components/forms/stage/chainShared";
import { formatDisplayDate } from "../../lib/workflow";
import { Badge } from "../ui/Badge";
import { Table } from "../ui/Table";
import type { AppUser, ProductionLot, ProductionTxn } from "../../lib/types";

/**
 * The per-section tracking view -  what a click on a GameLevelPath node (or a
 * Workflow Map marker) actually shows.
 *
 * Root cause of the old "unrelated rows/columns" complaint: the previous
 * OrderDetailPage rendered the same generic stage_entries columns (Forwarded /
 * Rejected / Returned) for every section regardless of what it actually
 * captures. This renders from chain.ts's per-section shape instead -  the same
 * lot/size/ref/doc fields the operator actually typed into the ledger -  and
 * shows a clean empty state when nothing has happened yet, rather than a table
 * of zeroes.
 */

export function StageDetailPanel({
  stage,
  chainStage,
  chain,
  nameOf,
  usersById,
  nextStage,
  nextStageAssignees,
  nextStageAssigneesLoading,
  showAssignmentInfo = true,
}: {
  stage: StageProgress;
  chainStage: ChainStage | null;
  chain: ProductionChain | null;
  nameOf: (id: string) => string;
  usersById: Map<string, AppUser>;
  nextStage?: StageProgress;
  nextStageAssignees?: AppUser[];
  nextStageAssigneesLoading?: boolean;
  showAssignmentInfo?: boolean;
}) {
  const notStarted = !chainStage || (!chainStage.isStarted && stage.entries.length === 0);

  const cumulativeLoss = useMemo(() => {
    if (!chain || !chainStage || chainStage.byLot.length === 0) return null;
    const lotsById = new Map(chain.lots.map((l) => [l.id, l]));
    let total = 0;
    for (const lf of chainStage.byLot) {
      const lot = lotsById.get(lf.lotId);
      if (!lot) continue;
      total += buildLotJourney(lot, chain).totalLoss;
    }
    return total;
  }, [chain, chainStage]);

  if (notStarted) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
        <p className="text-2xl">⏳</p>
        <p className="mt-2 text-sm font-semibold text-ink-700">Not Started Yet</p>
        <p className="mt-1 text-xs text-ink-400">Nothing has been recorded for this section.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {chainStage && (
        <>
          <ChainStrip cs={chainStage} />

          {cumulativeLoss !== null && cumulativeLoss > 0 && (
            <p className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-800">
              Cumulative loss across every lot up to this stage:{" "}
              <b>
                {cumulativeLoss.toLocaleString()} {chainStage.unit}
              </b>
            </p>
          )}

          {stage.stage.form_type === "lot_inspection" && chainStage.byLot.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Lot Status</h4>
              <div className="flex flex-wrap gap-2">
                {chainStage.byLot.map((l) => {
                  const status = lotStatus(l);
                  return (
                    <div
                      key={l.lotId}
                      className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2"
                    >
                      <span className="text-xs font-semibold text-ink-900">{l.lotNo}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {chainStage.byLot.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Lot-wise Breakdown</h4>
              <LotSummaryTable cs={chainStage} />
            </div>
          )}

          {chainStage.bySize.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Size-wise Breakdown</h4>
              <SizeSummaryTable cs={chainStage} />
            </div>
          )}

          {chainStage.material && chain && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Material Position</h4>
              <Table
                keyFor={(f) => f.requirement.id}
                rows={chain.requirementFlows}
                emptyMessage="No yarn or fabric planned for this order yet."
                columns={[
                  { header: "Material", render: (f) => f.requirement.name },
                  { header: "Type", render: (f) => f.requirement.category },
                  { header: "Required", render: (f) => f.totals.required.toLocaleString() },
                  { header: "DC", render: (f) => f.totals.dc.toLocaleString() },
                  { header: "Received", render: (f) => f.totals.received.toLocaleString() },
                  { header: "Inward", render: (f) => f.totals.inward.toLocaleString() },
                  { header: "Balance", render: (f) => Math.max(f.balance, 0).toLocaleString() },
                  {
                    header: "Status",
                    render: (f) => (
                      <Badge tone={f.requirement.is_completed ? "good" : "warn"}>
                        {f.requirement.is_completed ? "Complete" : "In Progress"}
                      </Badge>
                    ),
                  },
                ]}
              />
            </div>
          )}

          {chainStage.txns.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Section Ledger</h4>
              <TxnTable txns={chainStage.txns} nameOf={nameOf} lots={chain?.lots ?? []} />
            </div>
          )}
        </>
      )}

      {showAssignmentInfo && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ContactTile
            label="Responsible Person(s)"
            people={stage.responsibleUserIds.map((id) => usersById.get(id)).filter((u): u is AppUser => !!u)}
            emptyLabel="Not yet actioned"
          />
          <ContactTile
            label="Next Assigned Person"
            people={nextStageAssignees ?? []}
            emptyLabel={nextStageAssigneesLoading ? "Loading…" : "No one assigned to the next stage yet"}
          />
        </div>
      )}

      {showAssignmentInfo && !stage.isCompleted && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Estimated completion: <span className="font-semibold">{formatDisplayDate(stage.estimatedCompletionDate)}</span>{" "}
          (based on a typical {stage.stage.typical_duration_days}-day cycle for this stage)
          {nextStage ? ` · next: ${nextStage.stage.label}` : ""}
        </p>
      )}
    </div>
  );
}

/** Only the columns that actually have data across these rows -  a lot-wise
 * KG ledger looks different from a size-wise PCS one, and both look different
 * from a send/receive pair, by design. */
function TxnTable({
  txns,
  nameOf,
  lots,
}: {
  txns: ProductionTxn[];
  nameOf: (id: string) => string;
  lots: ProductionLot[];
}) {
  const hasLot = txns.some((t) => t.lot_id);
  const hasSize = txns.some((t) => t.size_code);
  const hasRef = txns.some((t) => t.ref_name);
  const hasDoc = txns.some((t) => t.doc_no);
  const hasIn = txns.some((t) => t.qty_in > 0);
  const hasOut = txns.some((t) => t.qty_out > 0);
  const hasRejected = txns.some((t) => t.qty_rejected > 0);
  const hasRework = txns.some((t) => t.qty_rework > 0);
  const mixedTxnTypes = new Set(txns.map((t) => t.txn_type)).size > 1;
  const lotsById = new Map(lots.map((l) => [l.id, l.lot_no]));
  const lotName = (id: string | null) => (id ? (lotsById.get(id) ?? "- ") : "- ");

  const sorted = [...txns].sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at));

  return (
    <Table
      keyFor={(t) => t.id}
      rows={sorted}
      emptyMessage="No entries recorded for this section yet."
      columns={[
        { header: "Date", render: (t) => formatDisplayDate(t.entry_date) },
        ...(mixedTxnTypes
          ? [{ header: "Type", render: (t: ProductionTxn) => <Badge tone={t.txn_type === "send" ? "external" : t.txn_type === "receive" ? "good" : "neutral"}>{t.txn_type}</Badge> }]
          : []),
        ...(hasLot ? [{ header: "Lot", render: (t: ProductionTxn) => lotName(t.lot_id) }] : []),
        ...(hasSize ? [{ header: "Size", render: (t: ProductionTxn) => t.size_code ?? "- " }] : []),
        ...(hasRef ? [{ header: "Party", render: (t: ProductionTxn) => t.ref_name ?? "- " }] : []),
        ...(hasDoc ? [{ header: "Doc", render: (t: ProductionTxn) => t.doc_no ?? "- " }] : []),
        ...(hasIn ? [{ header: "In", render: (t: ProductionTxn) => t.qty_in.toLocaleString() }] : []),
        ...(hasOut ? [{ header: "Out", render: (t: ProductionTxn) => t.qty_out.toLocaleString() }] : []),
        ...(hasRejected
          ? [{ header: "Rejected", render: (t: ProductionTxn) => (t.qty_rejected > 0 ? t.qty_rejected.toLocaleString() : "- ") }]
          : []),
        ...(hasRework
          ? [{ header: "Rework", render: (t: ProductionTxn) => (t.qty_rework > 0 ? t.qty_rework.toLocaleString() : "- ") }]
          : []),
        { header: "By", render: (t) => nameOf(t.entered_by) },
        { header: "Notes", render: (t) => t.notes || "- " },
      ]}
    />
  );
}

function ContactTile({ label, people, emptyLabel }: { label: string; people: AppUser[]; emptyLabel: string }) {
  const unique = Array.from(new Map(people.map((p) => [p.id, p])).values());
  return (
    <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      {unique.length === 0 ? (
        <p className="mt-0.5 text-sm text-ink-400">{emptyLabel}</p>
      ) : (
        <div className="mt-0.5 space-y-0.5">
          {unique.map((p) => (
            <div key={p.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-ink-900">{p.name}</span>
              {p.phone ? (
                <a href={`tel:${p.phone}`} className="text-xs font-medium text-brand hover:underline">
                  {p.phone}
                </a>
              ) : (
                <span className="text-xs text-ink-400">no phone on file</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
