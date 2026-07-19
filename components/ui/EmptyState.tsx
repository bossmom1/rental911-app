import type { ReactNode } from 'react';

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-light-blue bg-white p-10 text-center">
      <p className="font-display text-lg font-bold text-navy">{title}</p>
      {message && <p className="mx-auto mt-2 max-w-md text-ink/70">{message}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function DataTable({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-light-blue/60 bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-light-blue/60 bg-light-blue/20">
            {columns.map((c) => (
              <th
                key={c}
                className="px-4 py-3 font-display font-bold text-navy"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-light-blue/40">{children}</tbody>
      </table>
    </div>
  );
}
