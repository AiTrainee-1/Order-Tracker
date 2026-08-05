import { useMemo, useState } from "react";
import { useUsers } from "../../hooks/useUsers";
import { useOrdersList } from "../../hooks/useOrdersList";
import { useWorkflowStages } from "../../hooks/useWorkflowStages";
import {
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
} from "../../hooks/useAssignments";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Select, Input, Toggle, Checkbox } from "../../components/ui/FormControls";
import { Button } from "../../components/ui/Button";
import { Table } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { Loader } from "../../components/ui/Loader";

export function AssignWorkPage() {
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: ordersData, isLoading: ordersLoading } = useOrdersList();
  const { data: stages, isLoading: stagesLoading } = useWorkflowStages();
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments();
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const [userId, setUserId] = useState("");
  const [ioNo, setIoNo] = useState("");
  const [orderId, setOrderId] = useState("");
  const [poId, setPoId] = useState<string>(""); // "" = all POs
  const [sectionIds, setSectionIds] = useState<Set<string>>(new Set());
  const [unitName, setUnitName] = useState("");
  const [canEnterData, setCanEnterData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const orders = useMemo(() => ordersData?.orders ?? [], [ordersData]);
  const purchaseOrders = useMemo(() => ordersData?.purchaseOrders ?? [], [ordersData]);

  const ioNumbers = useMemo(() => Array.from(new Set(orders.map((o) => o.io_no))), [orders]);
  const ordersForIo = useMemo(() => orders.filter((o) => o.io_no === ioNo), [orders, ioNo]);
  const posForOrder = useMemo(
    () => purchaseOrders.filter((p) => p.order_id === orderId),
    [purchaseOrders, orderId],
  );

  const isLoading = usersLoading || ordersLoading || stagesLoading || assignmentsLoading;
  if (isLoading) return <Loader full label="Loading assignment data…" />;

  function toggleSection(id: string) {
    setSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!userId || !orderId || sectionIds.size === 0) {
      setError("Select a user, an order, and at least one section.");
      return;
    }
    try {
      await Promise.all(
        Array.from(sectionIds).map((sectionId) =>
          createAssignment.mutateAsync({
            user_id: userId,
            order_id: orderId,
            po_id: poId || null,
            section_id: sectionId,
            unit_name: unitName || null,
            can_enter_data: canEnterData,
          }),
        ),
      );
      setSuccess(`Assigned ${sectionIds.size} section(s) successfully.`);
      setSectionIds(new Set());
      setUnitName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save assignment.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Assign Work</h1>
        <p className="text-sm text-ink-500">
          Scope exactly which order, PO, and section a user is responsible for.
        </p>
      </div>

      <Card>
        <CardHeader title="New Assignment" />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="User" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select user…</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </Select>

            <Select
              label="IO / No"
              value={ioNo}
              onChange={(e) => {
                setIoNo(e.target.value);
                setOrderId("");
                setPoId("");
              }}
            >
              <option value="">Select IO/No…</option>
              {ioNumbers.map((io) => (
                <option key={io} value={io}>
                  {io}
                </option>
              ))}
            </Select>

            <Select
              label="Style / Color"
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setPoId("");
              }}
              disabled={!ioNo}
            >
              <option value="">Select style/color…</option>
              {ordersForIo.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.style} — {o.color}
                </option>
              ))}
            </Select>

            <Select
              label="PO (optional — leave as All to cover every PO)"
              value={poId}
              onChange={(e) => setPoId(e.target.value)}
              disabled={!orderId}
            >
              <option value="">All POs</option>
              {posForOrder.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.po_number} ({po.quantity.toLocaleString()} pcs)
                </option>
              ))}
            </Select>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ink-700">Section(s)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {(stages ?? []).map((s) => (
                <Checkbox
                  key={s.id}
                  checked={sectionIds.has(s.id)}
                  onChange={() => toggleSection(s.id)}
                  label={s.label}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Unit / Vendor Name (optional)"
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              placeholder="e.g. Unit 1, ABC Subcontractor"
            />
            <div className="flex items-end">
              <Toggle
                checked={canEnterData}
                onChange={setCanEnterData}
                label="Can Enter Data"
                description="Turn off for monitor-only access to this scope."
              />
            </div>
          </div>

          {error && <p className="text-sm text-status-bad">{error}</p>}
          {success && <p className="text-sm text-status-good">{success}</p>}

          <div className="flex justify-end">
            <Button onClick={handleSubmit} isLoading={createAssignment.isPending}>
              Save Assignment
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Existing Assignments" subtitle={`${assignments?.length ?? 0} total`} />
        <CardBody>
          <Table
            keyFor={(a) => a.id}
            rows={assignments ?? []}
            columns={[
              { header: "User", render: (a) => a.user?.name ?? "—" },
              {
                header: "Order",
                render: (a) => (
                  <div>
                    <p className="font-medium text-ink-900">{a.order?.style}</p>
                    <p className="text-xs text-ink-500">
                      IO {a.order?.io_no} · {a.order?.color}
                    </p>
                  </div>
                ),
              },
              { header: "PO", render: (a) => a.po?.po_number ?? "All POs" },
              { header: "Section", render: (a) => a.section?.label ?? "—" },
              { header: "Unit", render: (a) => a.unit_name ?? "—" },
              {
                header: "Access",
                render: (a) => (
                  <Badge tone={a.can_enter_data ? "neutral" : "info"}>
                    {a.can_enter_data ? "Can Enter Data" : "Monitor Only"}
                  </Badge>
                ),
              },
              {
                header: "",
                render: (a) => (
                  <Button variant="ghost" size="sm" onClick={() => deleteAssignment.mutate(a.id)}>
                    Remove
                  </Button>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
