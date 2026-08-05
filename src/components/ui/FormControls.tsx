import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

function FieldWrapper({ label, error, children }: { label?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-medium text-ink-700">{label}</span>}
      {children}
      {error && <span className="mt-1 block text-xs text-status-bad">{error}</span>}
    </label>
  );
}

const baseInputClass =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-1 focus:ring-ink-900 disabled:bg-ink-50 disabled:text-ink-400";

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
      <select ref={ref} className={`${baseInputClass} ${className}`} {...rest}>
        {children}
      </select>
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
      <textarea ref={ref} className={`${baseInputClass} ${className}`} rows={3} {...rest} />
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
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <p className="text-sm font-medium text-ink-800">{label}</p>
        {description && <p className="text-xs text-ink-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-ink-900" : "bg-ink-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
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
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-ink-300 text-ink-900 focus:ring-ink-900"
      />
      {label}
    </label>
  );
}
