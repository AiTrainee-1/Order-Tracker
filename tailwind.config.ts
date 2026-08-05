import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cool slate-based neutral scale (kept the "ink" name used across the
        // app; values match Tailwind's slate scale for a premium cool-gray tone).
        ink: {
          950: "#020617",
          900: "#0f172a",
          800: "#1e293b",
          700: "#334155",
          600: "#475569",
          500: "#64748b",
          400: "#94a3b8",
          300: "#cbd5e1",
          200: "#e2e8f0",
          100: "#f1f5f9",
          50: "#f8fafc",
        },
        brand: {
          DEFAULT: "#4f46e5",
          light: "#6366f1",
          dark: "#3730a3",
        },
        status: {
          good: "#16a34a",
          warn: "#d97706",
          bad: "#dc2626",
          info: "#2563eb",
          idle: "#94a3b8",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15,23,42,0.04), 0 1px 3px 0 rgba(15,23,42,0.06)",
        popover: "0 20px 40px -10px rgba(15,23,42,0.2)",
        glow: "0 0 0 4px rgba(79,70,229,0.12)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #4338ca 0%, #4f46e5 45%, #2563eb 100%)",
        "good-gradient": "linear-gradient(135deg, #15803d 0%, #22c55e 100%)",
        "warn-gradient": "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
        "bad-gradient": "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)",
        "mesh-dark":
          "radial-gradient(at 20% 20%, rgba(99,102,241,0.35) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(37,99,235,0.3) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(129,140,248,0.25) 0px, transparent 50%)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 2s ease-in-out infinite",
        floatSlow: "floatSlow 6s ease-in-out infinite",
        fadeInUp: "fadeInUp 0.35s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
