import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-dark text-white shadow-card hover:bg-brand hover:shadow-card-hover active:brightness-95 disabled:opacity-50 disabled:hover:bg-brand-dark",
  secondary:
    "bg-white text-ink-800 border border-ink-200 shadow-card hover:bg-ink-50 hover:border-ink-300 disabled:opacity-50 disabled:text-ink-300",
  ghost: "bg-transparent text-ink-600 hover:bg-ink-100 disabled:text-ink-300",
  danger:
    "bg-status-bad text-white shadow-card hover:brightness-95 disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1.5 rounded-lg gap-1.5",
  md: "text-sm px-4 py-2.5 rounded-xl gap-2",
  lg: "text-base px-5 py-3 rounded-xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, className = "", children, disabled, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 disabled:cursor-not-allowed whitespace-nowrap active:scale-[0.98] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        disabled={disabled || isLoading}
        {...rest}
      >
        {isLoading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
