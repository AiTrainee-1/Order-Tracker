import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

function FieldWrapper({ label, error, children }: { label?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-600">{label}</span>}
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-status-bad">{error}</span>}
    </label>
  );
}

const baseInputClass =
  "w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 shadow-card transition-all focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 disabled:border-ink-100 disabled:bg-ink-50 disabled:text-ink-400";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...rest }, ref) => (
    <FieldWrapper label={label} error={error}>
      <input ref={ref} className={`${baseInputClass} ${className}`} {...rest} />
    </FieldWrapper>
  ),
);
Input.displayName = "Input";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = "", children, ...rest }, ref) => (
    <FieldWrapper label={label} error={error}>
      <div className="relative">
        <select
          ref={ref}
          className={`${baseInputClass} cursor-pointer appearance-none pr-9 ${className}`}
          {...rest}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M5.5 8l4.5 4.5L14.5 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </FieldWrapper>
  ),
);
Select.displayName = "Select";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", ...rest }, ref) => (
    <FieldWrapper label={label} error={error}>
      <textarea ref={ref} className={`${baseInputClass} resize-none ${className}`} rows={3} {...rest} />
    </FieldWrapper>
  ),
);
Textarea.displayName = "Textarea";

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-800">{label}</p>
        {description && <p className="mt-0.5 text-xs leading-snug text-ink-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-brand-gradient" : "bg-ink-200"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded border border-ink-300 text-brand focus:ring-brand"
      />
      <span className="leading-tight">{label}</span>
    </label>
  );
}
