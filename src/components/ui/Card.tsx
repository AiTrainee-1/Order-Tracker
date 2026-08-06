import type { HTMLAttributes, ReactNode } from "react";
import { GLASS_CARD } from "../../lib/theme";

type CardProps = HTMLAttributes<HTMLDivElement>;

/** Frosted panel — the same surface treatment as the sign-in card, kept at 80%
 * white so dense tables and long numbers stay fully legible over the mesh. */
export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div className={`${GLASS_CARD} transition-shadow ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/70 px-6 py-4">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        {subtitle && <p className="mt-0.5 truncate text-xs text-ink-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}
