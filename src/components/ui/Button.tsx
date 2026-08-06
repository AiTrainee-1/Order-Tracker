import { forwardRef, type ButtonHTMLAttributes } from "react";
import { brandGradient, dangerGradient, SHADOW_BRAND } from "../../lib/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: `text-white ${SHADOW_BRAND} hover:brightness-110 hover:shadow-[0_16px_40px_-10px_rgba(21,94,239,0.65)] disabled:opacity-60`,
  secondary:
    "border border-white/80 bg-white/70 text-ink-800 shadow-[0_8px_20px_-14px_rgba(30,41,90,0.45)] backdrop-blur-md hover:bg-white hover:text-ink-900 disabled:opacity-60",
  ghost: "bg-transparent text-ink-600 hover:bg-white/70 hover:text-ink-900 disabled:text-ink-300",
  danger: "text-white shadow-[0_12px_30px_-8px_rgba(239,68,68,0.5)] hover:brightness-110 disabled:opacity-60",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 rounded-lg gap-1.5",
  md: "text-sm px-4 py-2.5 rounded-xl gap-2",
  lg: "text-base px-5 py-3 rounded-xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, className = "", children, disabled, style, ...rest }, ref) => {
    // Gradients ride as inline styles so they can't be lost to a stale config.
    const gradient =
      variant === "primary" ? brandGradient : variant === "danger" ? dangerGradient : undefined;

    return (
      <button
        ref={ref}
        style={{ ...gradient, ...style }}
        className={`inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:cursor-not-allowed whitespace-nowrap active:scale-[0.98] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
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
