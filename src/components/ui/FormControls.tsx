import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { brandGradient } from "../../lib/theme";

function FieldWrapper({ label, error, children }: { label?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-600">{label}</span>}
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-status-bad">{error}</span>}
    </label>
  );
}

// Frosted field, matching the sign-in inputs: pressed into the glass via an
// inset shadow, with a soft brand ring on focus rather than a hard border.
const baseInputClass =
  "w-full rounded-xl border border-white/90 bg-white/85 px-3.5 py-2.5 text-sm font-medium text-ink-900 placeholder:font-normal placeholder:text-ink-400 shadow-[inset_0_1px_3px_rgba(16,24,40,0.08)] outline-none transition-all focus:border-brand/50 focus:bg-white focus:shadow-[0_0_0_4px_rgba(21,94,239,0.16),inset_0_1px_3px_rgba(16,24,40,0.05)] disabled:border-ink-100 disabled:bg-ink-50/80 disabled:text-ink-400";

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
        style={checked ? brandGradient : undefined}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked
            ? "shadow-[0_4px_12px_-4px_rgba(21,94,239,0.6)]"
            : "bg-ink-200 shadow-[inset_2px_2px_5px_-2px_rgba(30,41,90,0.3),inset_-2px_-2px_5px_-2px_rgba(255,255,255,0.8)]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[2px_2px_4px_-1px_rgba(30,41,90,0.35)] transition-transform duration-200 ${
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
    <label className="group flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
      <span className="relative inline-flex h-5 w-5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all duration-150 ${
            checked
              ? "border-brand shadow-[0_3px_8px_-2px_rgba(21,94,239,0.5)]"
              : "border-ink-300 bg-white shadow-[inset_1px_1px_3px_rgba(30,41,90,0.12)] group-hover:border-brand/60"
          }`}
          style={checked ? brandGradient : undefined}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3.2"
            className={`transition-opacity duration-150 ${checked ? "opacity-100" : "opacity-0"}`}
          >
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-brand/40 ring-offset-1 opacity-0 peer-focus-visible:opacity-100" />
      </span>
      <span className="leading-tight">{label}</span>
    </label>
  );
}
