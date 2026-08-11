import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEMO_LOTS,
  DEMO_MATERIAL_ENTRIES,
  DEMO_ORDER,
  DEMO_PO,
  DEMO_PREFIX,
  DEMO_REQUIREMENTS,
  DEMO_SIZES,
  buildDemoTxns,
} from "../lib/demoData";
import type {
  MaterialEntry,
  MaterialRequirement,
  Order,
  PoSizeQuantity,
  ProductionLot,
  ProductionTxn,
  PurchaseOrder,
  StageEntry,
  WorkflowStage,
} from "../lib/types";

/**
 * Demo mode -  the sandbox behind the Preview button on Stage Roles.
 *
 * The real stage forms are rendered inside this provider so someone can try
 * them out: fill fields, add entries, press the buttons, watch the totals move.
 * Nothing reaches the database.
 *
 * The guarantee is enforced at the WRITE ITSELF, not around it. Every mutation
 * in useProductionChain.ts and useStageEntries.ts asks `useDemoStore()` first
 * and, if it gets a store back, updates this in-memory state and returns
 * without calling Supabase. Putting the check at the point of the write means
 * anyone reading `useCreateTxns` can see the protection -  a wrapper further out
 * would be one refactor away from being bypassed silently.
 *
 * Reads are guarded the same way, so the sandbox never even fetches the real
 * order. Outside the provider `useDemoStore()` returns null and every hook
 * behaves exactly as before.
 */

export interface DemoStore {
  order: Order;
  purchaseOrders: PurchaseOrder[];
  sizes: PoSizeQuantity[];
  lots: ProductionLot[];
  requirements: MaterialRequirement[];
  materialEntries: MaterialEntry[];
  txns: ProductionTxn[];
  stageEntries: StageEntry[];

  addTxns: (rows: Omit<ProductionTxn, "id" | "created_at" | "updated_at" | "updated_by">[]) => void;
  patchTxn: (id: string, patch: Partial<ProductionTxn>) => void;
  addLot: (input: { lot_no: string; po_id: string | null }) => ProductionLot;
  removeLot: (id: string) => void;
  saveRequirement: (id: string | undefined, input: Partial<MaterialRequirement>) => string;
  removeRequirement: (id: string) => void;
  saveMaterialEntry: (id: string | undefined, input: Partial<MaterialEntry>) => void;
  removeMaterialEntry: (id: string) => void;
  addStageEntry: (row: Omit<StageEntry, "id" | "created_at">) => void;
  /** Throws the sandbox away and rebuilds it from the fixtures. */
  reset: () => void;
}

const DemoModeContext = createContext<DemoStore | null>(null);

let idSeq = 0;
const nextId = (kind: string) => `${DEMO_PREFIX}${kind}-${++idSeq}`;
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

interface DemoState {
  lots: ProductionLot[];
  requirements: MaterialRequirement[];
  materialEntries: MaterialEntry[];
  txns: ProductionTxn[];
  stageEntries: StageEntry[];
}

function initialState(stages: WorkflowStage[]): DemoState {
  return {
    lots: [...DEMO_LOTS],
    requirements: [...DEMO_REQUIREMENTS],
    materialEntries: [...DEMO_MATERIAL_ENTRIES],
    txns: buildDemoTxns(stages),
    stageEntries: [],
  };
}

export function DemoModeProvider({
  stages,
  children,
}: {
  /** The real workflow stages -  the fixture chain is generated against them so
   * the sandbox matches the live stage list rather than a hard-coded copy. */
  stages: WorkflowStage[];
  children: ReactNode;
}) {
  const [state, setState] = useState<DemoState>(() => initialState(stages));

  const reset = useCallback(() => setState(initialState(stages)), [stages]);

  const store = useMemo<DemoStore>(
    () => ({
      order: DEMO_ORDER,
      purchaseOrders: [DEMO_PO],
      sizes: DEMO_SIZES,
      ...state,

      addTxns: (rows) =>
        setState((prev) => ({
          ...prev,
          txns: [
            ...prev.txns,
            ...rows.map((r) => ({
              ...r,
              id: nextId("txn"),
              created_at: nowIso(),
              updated_by: null,
              updated_at: nowIso(),
            })),
          ],
        })),

      patchTxn: (id, patch) =>
        setState((prev) => ({
          ...prev,
          txns: prev.txns.map((t) => (t.id === id ? { ...t, ...patch, updated_at: nowIso() } : t)),
        })),

      addLot: ({ lot_no, po_id }) => {
        const lot: ProductionLot = {
          id: nextId("lot"),
          order_id: DEMO_ORDER.id,
          po_id,
          lot_no,
          fabric_type: null,
          notes: null,
          created_by: null,
          created_at: nowIso(),
        };
        setState((prev) => ({ ...prev, lots: [...prev.lots, lot] }));
        return lot;
      },

      removeLot: (id) =>
        setState((prev) => ({ ...prev, lots: prev.lots.filter((l) => l.id !== id) })),

      saveRequirement: (id, input) => {
        if (id) {
          setState((prev) => ({
            ...prev,
            requirements: prev.requirements.map((r) =>
              r.id === id ? { ...r, ...input, updated_at: nowIso() } : r,
            ),
          }));
          return id;
        }
        const newId = nextId("req");
        setState((prev) => ({
          ...prev,
          requirements: [
            ...prev.requirements,
            {
              id: newId,
              order_id: DEMO_ORDER.id,
              po_id: DEMO_PO.id,
              category: "yarn",
              name: "",
              required_qty: 0,
              unit: "KG",
              supplier: null,
              sort_order: prev.requirements.length,
              is_completed: false,
              notes: null,
              created_by: null,
              created_at: nowIso(),
              updated_by: null,
              updated_at: nowIso(),
              ...input,
            } as MaterialRequirement,
          ],
        }));
        return newId;
      },

      removeRequirement: (id) =>
        setState((prev) => ({
          ...prev,
          requirements: prev.requirements.filter((r) => r.id !== id),
          materialEntries: prev.materialEntries.filter((e) => e.requirement_id !== id),
        })),

      saveMaterialEntry: (id, input) =>
        setState((prev) => {
          if (id) {
            return {
              ...prev,
              materialEntries: prev.materialEntries.map((e) =>
                e.id === id ? { ...e, ...input, updated_at: nowIso() } : e,
              ),
            };
          }
          return {
            ...prev,
            materialEntries: [
              ...prev.materialEntries,
              {
                id: nextId("mat"),
                requirement_id: "",
                entry_type: "dc",
                qty: 0,
                entry_date: today(),
                supplier: null,
                doc_no: null,
                doc_date: null,
                lot_ref: null,
                notes: null,
                entered_by: "demo-user",
                created_at: nowIso(),
                updated_by: null,
                updated_at: nowIso(),
                ...input,
              } as MaterialEntry,
            ],
          };
        }),

      removeMaterialEntry: (id) =>
        setState((prev) => ({
          ...prev,
          materialEntries: prev.materialEntries.filter((e) => e.id !== id),
        })),

      addStageEntry: (row) =>
        setState((prev) => ({
          ...prev,
          stageEntries: [...prev.stageEntries, { ...row, id: nextId("entry"), created_at: nowIso() }],
        })),

      reset,
    }),
    [state, reset],
  );

  return <DemoModeContext.Provider value={store}>{children}</DemoModeContext.Provider>;
}

/**
 * The sandbox store, or null when running against the real database.
 *
 * Every hook that reads or writes production data checks this first. `null`
 * means "behave normally" -  which is the case everywhere except inside a
 * Preview.
 */
export function useDemoStore(): DemoStore | null {
  return useContext(DemoModeContext);
}
