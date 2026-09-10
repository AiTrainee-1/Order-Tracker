import type { JobWorkEntry } from "./types";

/**
 * Rolls Job Work entries up per section (and per size within a section) -
 * the read side of the separate ledger migration 023 introduces.
 *
 * Deliberately NOT part of chain.ts: Job Work quantities never feed the
 * in-house input/output/balance calculation there, so this stays its own
 * small, independently-testable function rather than one more branch inside
 * buildProductionChain. Consumers (the Job Work entry page, Output & Reports)
 * fold these totals in themselves, locally, exactly where they choose to.
 */
export interface JobWorkSummary {
  /** section_id -> total qty, summed across every row regardless of mode. */
  totalBySection: Map<string, number>;
  /** section_id -> (size_code -> qty), summed only across mode: 'size' rows. */
  bySizeBySection: Map<string, Map<string, number>>;
}

export function buildJobWorkSummary(entries: JobWorkEntry[]): JobWorkSummary {
  const totalBySection = new Map<string, number>();
  const bySizeBySection = new Map<string, Map<string, number>>();

  for (const e of entries) {
    totalBySection.set(e.section_id, (totalBySection.get(e.section_id) ?? 0) + e.qty);

    if (e.mode === "size" && e.size_code) {
      const bySize = bySizeBySection.get(e.section_id) ?? new Map<string, number>();
      bySize.set(e.size_code, (bySize.get(e.size_code) ?? 0) + e.qty);
      bySizeBySection.set(e.section_id, bySize);
    }
  }

  return { totalBySection, bySizeBySection };
}
