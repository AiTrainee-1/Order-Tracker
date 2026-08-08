import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { useWorkflowStages } from "./useWorkflowStages";
import { buildProductionChain, type ProductionChain } from "../lib/chain";
import { effectiveSizes, sortSizes } from "../lib/sizes";
import type {
  AuditLogRow,
  MaterialEntry,
  MaterialRequirement,
  PoSizeQuantity,
  ProductionLot,
  ProductionTxn,
  PurchaseOrder,
} from "../lib/types";

/**
 * All four production ledgers for one order, fetched together and assembled
 * into a ProductionChain.
 *
 * They're loaded as a single bundle rather than per stage because the chain
 * calculation is inherently whole-order: Packing's balance depends on Sewing's
 * output, which depends on Cutting's, and so on back to the yarn. Fetching them
 * piecemeal would mean stages could render against different snapshots and
 * disagree — which is exactly the failure this rewrite exists to prevent.
 */

const KEY = "production_chain";

export interface ProductionBundle {
  sizes: PoSizeQuantity[];
  lots: ProductionLot[];
  requirements: MaterialRequirement[];
  materialEntries: MaterialEntry[];
  txns: ProductionTxn[];
}

async function fetchBundle(orderId: string, poIds: string[]): Promise<ProductionBundle> {
  const [sizesRes, lotsRes, reqsRes, txnsRes] = await Promise.all([
    poIds.length
      ? supabase.from("po_size_quantities").select("*").in("po_id", poIds)
      : Promise.resolve({ data: [] as PoSizeQuantity[], error: null }),
    supabase.from("production_lots").select("*").eq("order_id", orderId),
    supabase.from("material_requirements").select("*").eq("order_id", orderId),
    supabase.from("production_txns").select("*").eq("order_id", orderId),
  ]);

  if (sizesRes.error) throw sizesRes.error;
  if (lotsRes.error) throw lotsRes.error;
  if (reqsRes.error) throw reqsRes.error;
  if (txnsRes.error) throw txnsRes.error;

  const requirements = (reqsRes.data ?? []) as MaterialRequirement[];

  // Material entries hang off requirements, so they can only be fetched once
  // the requirement ids are known.
  let materialEntries: MaterialEntry[] = [];
  if (requirements.length > 0) {
    const { data, error } = await supabase
      .from("material_entries")
      .select("*")
      .in("requirement_id", requirements.map((r) => r.id));
    if (error) throw error;
    materialEntries = (data ?? []) as MaterialEntry[];
  }

  return {
    sizes: (sizesRes.data ?? []) as PoSizeQuantity[],
    lots: (lotsRes.data ?? []) as ProductionLot[],
    requirements,
    materialEntries,
    txns: (txnsRes.data ?? []) as ProductionTxn[],
  };
}

export function useProductionBundle(orderId: string | undefined, purchaseOrders: PurchaseOrder[]) {
  const poIds = useMemo(() => purchaseOrders.map((p) => p.id), [purchaseOrders]);

  return useQuery({
    queryKey: [KEY, orderId, poIds],
    enabled: !!orderId,
    queryFn: () => fetchBundle(orderId!, poIds),
  });
}

/**
 * The chain for one scope: a specific PO, or the whole order when poId is null.
 *
 * PO scope filters the ledgers to that PO and measures against its own size
 * breakdown. Order scope keeps everything and sums the size breakdowns across
 * POs, so "all POs combined" is a real aggregate rather than an approximation.
 */
export function useProductionChain({
  orderId,
  purchaseOrders,
  poId,
}: {
  orderId: string | undefined;
  purchaseOrders: PurchaseOrder[];
  poId: string | null;
}): { chain: ProductionChain | null; bundle: ProductionBundle | undefined; isLoading: boolean; isError: boolean } {
  const stagesQuery = useWorkflowStages();
  const bundleQuery = useProductionBundle(orderId, purchaseOrders);

  const chain = useMemo(() => {
    const stages = stagesQuery.data;
    const bundle = bundleQuery.data;
    if (!stages || !bundle) return null;

    const scopedPos = poId ? purchaseOrders.filter((p) => p.id === poId) : purchaseOrders;
    const scopedPoIds = new Set(scopedPos.map((p) => p.id));

    const sizes = poId
      ? effectiveSizes(
          scopedPos[0],
          bundle.sizes.filter((s) => s.po_id === poId),
        )
      : mergeSizesAcrossPos(purchaseOrders, bundle.sizes);

    const totalPcs = sizes.reduce((total, s) => total + s.quantity, 0);

    return buildProductionChain({
      stages,
      totalPcs,
      sizes,
      lots: bundle.lots.filter((l) => !poId || !l.po_id || l.po_id === poId),
      requirements: bundle.requirements.filter((r) => !poId || !r.po_id || r.po_id === poId),
      materialEntries: bundle.materialEntries,
      txns: bundle.txns.filter((t) => (poId ? t.po_id === poId : !t.po_id || scopedPoIds.has(t.po_id))),
    });
  }, [stagesQuery.data, bundleQuery.data, poId, purchaseOrders]);

  return {
    chain,
    bundle: bundleQuery.data,
    isLoading: stagesQuery.isLoading || bundleQuery.isLoading,
    isError: stagesQuery.isError || bundleQuery.isError,
  };
}

/** The order's POs on their own — stage forms are handed an assignment, not an
 * order bundle, so they need to resolve the PO list themselves. */
export function useOrderPurchaseOrders(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order_pos", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_orders").select("*").eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as PurchaseOrder[];
    },
  });
}

/**
 * Everything one stage form needs: its own link in the chain, the lots it can
 * pick from, and the size breakdown it measures against.
 *
 * Note it returns the WHOLE chain as well as this stage's slice — forms show
 * where their input came from, and the Fabric Store and Output screens walk
 * every stage, so handing back only the current one would just force a second
 * lookup.
 */
export function useStageChain(
  orderId: string | undefined,
  poId: string | null,
  sectionId: string | undefined,
) {
  const posQuery = useOrderPurchaseOrders(orderId);
  const purchaseOrders = posQuery.data ?? [];
  const { chain, bundle, isLoading, isError } = useProductionChain({ orderId, purchaseOrders, poId });

  const cs = useMemo(
    () => chain?.stages.find((s) => s.stage.id === sectionId) ?? null,
    [chain, sectionId],
  );

  const lots = useMemo(
    () => (chain?.lots ?? []).slice().sort((a, b) => a.lot_no.localeCompare(b.lot_no)),
    [chain],
  );

  return {
    chain,
    cs,
    lots,
    sizes: chain?.sizes ?? [],
    requirements: bundle?.requirements ?? [],
    materialEntries: bundle?.materialEntries ?? [],
    purchaseOrders,
    isLoading: posQuery.isLoading || isLoading,
    isError: posQuery.isError || isError,
  };
}

/** Sums each size code across every PO of an order, preserving first-seen
 * order so the combined view's columns line up with the individual POs'. */
function mergeSizesAcrossPos(
  purchaseOrders: PurchaseOrder[],
  allSizes: PoSizeQuantity[],
): { size_code: string; quantity: number }[] {
  const totals = new Map<string, number>();
  const order: string[] = [];

  for (const po of purchaseOrders) {
    const rows = effectiveSizes(po, sortSizes(allSizes.filter((s) => s.po_id === po.id)));
    for (const r of rows) {
      if (!totals.has(r.size_code)) order.push(r.size_code);
      totals.set(r.size_code, (totals.get(r.size_code) ?? 0) + r.quantity);
    }
  }

  return order.map((code) => ({ size_code: code, quantity: totals.get(code) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Mutations
//
// Every write goes through invalidateChain so the stage the user is on, the
// stages after it, and the Output dashboard all refresh from the same fetch.
// ---------------------------------------------------------------------------

function invalidateChain(queryClient: ReturnType<typeof useQueryClient>, orderId: string) {
  queryClient.invalidateQueries({ queryKey: [KEY] });
  queryClient.invalidateQueries({ queryKey: ["order_detail", orderId] });
  queryClient.invalidateQueries({ queryKey: ["audit_log"] });
  queryClient.invalidateQueries({ queryKey: ["my_work_entries"] });
}

export type NewTxn = Omit<ProductionTxn, "id" | "created_at" | "updated_at" | "updated_by">;

export function useCreateTxns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: NewTxn[]) => {
      const usable = rows.filter((r) => r.qty_in || r.qty_out || r.qty_rejected || r.qty_rework);
      if (usable.length === 0) return [] as ProductionTxn[];
      const { data, error } = await supabase.from("production_txns").insert(usable).select("*");
      if (error) throw error;
      return (data ?? []) as ProductionTxn[];
    },
    onSuccess: (_d, rows) => rows[0] && invalidateChain(queryClient, rows[0].order_id),
  });
}

export function useUpdateTxn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      orderId: _orderId,
      patch,
      userId,
    }: {
      id: string;
      orderId: string;
      patch: Partial<ProductionTxn>;
      userId: string;
    }) => {
      const { error } = await supabase
        .from("production_txns")
        .update({ ...patch, updated_by: userId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateChain(queryClient, v.orderId),
  });
}

export function useCreateLot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      order_id: string;
      po_id: string | null;
      lot_no: string;
      fabric_type?: string | null;
      notes?: string | null;
      created_by: string;
    }) => {
      const { data, error } = await supabase.from("production_lots").insert(input).select("*").single();
      if (error) throw error;
      return data as ProductionLot;
    },
    onSuccess: (_d, v) => invalidateChain(queryClient, v.order_id),
  });
}

export function useDeleteLot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderId: _orderId }: { id: string; orderId: string }) => {
      const { error } = await supabase.from("production_lots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateChain(queryClient, v.orderId),
  });
}

export type NewRequirement = Omit<
  MaterialRequirement,
  "id" | "created_at" | "updated_at" | "updated_by"
>;

export function useSaveRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
      userId,
    }: {
      id?: string;
      input: Partial<NewRequirement> & { order_id: string };
      userId: string;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("material_requirements")
          .update({ ...input, updated_by: userId })
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("material_requirements")
        .insert({ ...input, created_by: userId, updated_by: userId })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (_d, v) => invalidateChain(queryClient, v.input.order_id),
  });
}

export function useDeleteRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderId: _orderId }: { id: string; orderId: string }) => {
      const { error } = await supabase.from("material_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateChain(queryClient, v.orderId),
  });
}

export type NewMaterialEntry = Omit<
  MaterialEntry,
  "id" | "created_at" | "updated_at" | "updated_by"
>;

export function useSaveMaterialEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
      userId,
      orderId: _orderId,
    }: {
      id?: string;
      input: Partial<NewMaterialEntry>;
      userId: string;
      orderId: string;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("material_entries")
          .update({ ...input, updated_by: userId })
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("material_entries").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateChain(queryClient, v.orderId),
  });
}

export function useDeleteMaterialEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderId: _orderId }: { id: string; orderId: string }) => {
      const { error } = await supabase.from("material_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateChain(queryClient, v.orderId),
  });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type NewAuditRow = Omit<AuditLogRow, "id" | "created_at">;

export function useAuditLog(orderId: string | undefined, entityId?: string) {
  return useQuery({
    queryKey: ["audit_log", orderId, entityId],
    enabled: !!orderId,
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (entityId) q = q.eq("entity_id", entityId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditLogRow[];
    },
  });
}

/**
 * Records what changed, by whom, with the note they wrote.
 *
 * Audit failures are swallowed deliberately: losing the history of a saved
 * quantity is bad, but rolling back a floor operator's genuine production entry
 * because the log write failed is worse. The entry is the record of record.
 */
export function useRecordAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: NewAuditRow) => {
      const { error } = await supabase.from("audit_log").insert(row);
      if (error) console.warn("Audit log write failed:", error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audit_log"] }),
  });
}

/** Field-level diff for the audit log — only the keys that actually changed. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    const prev = before[key as keyof T];
    if (prev !== next && !(prev == null && next == null)) changes[key] = { from: prev, to: next };
  }
  return Object.keys(changes).length ? changes : null;
}
