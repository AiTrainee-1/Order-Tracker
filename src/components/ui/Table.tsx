import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function Table<T>({
  columns,
  rows,
  keyFor,
  emptyMessage = "Nothing to show yet.",
}: {
  columns: Column<T>[];
  rows: T[];
  keyFor: (row: T) => string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-400">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
            {columns.map((col) => (
              <th key={col.header} className={`whitespace-nowrap px-3 py-2 font-medium ${col.className ?? ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={keyFor(row)} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
              {columns.map((col) => (
                <td key={col.header} className={`px-3 py-2.5 align-middle text-ink-800 ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
