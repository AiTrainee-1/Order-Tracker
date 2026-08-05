import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300",
  secondary:
    "bg-white text-ink-900 border border-ink-200 hover:bg-ink-50 disabled:text-ink-300",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-100 disabled:text-ink-300",
  danger: "bg-status-bad text-white hover:bg-red-700 disabled:bg-red-200",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1.5 rounded-md gap-1.5",
  md: "text-sm px-3.5 py-2 rounded-lg gap-2",
  lg: "text-base px-5 py-2.5 rounded-lg gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, className = "", children, disabled, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
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
