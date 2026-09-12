import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Corporate Blue neutral scale -  cool navy-gray, matches the
        // Dark Navy Text / Secondary Text / Muted Text / app background spec.
        ink: {
          950: "#0B1526",
          900: "#101828",
          800: "#1D2939",
          700: "#344054",
          600: "#475467",
          500: "#667085",
          400: "#98A2B3",
          300: "#CBD5E1",
          200: "#E4EAF2",
          100: "#EEF2F8",
          50: "#F4F7FC",
        },
        brand: {
          DEFAULT: "#155EEF",
          light: "#2563EB",
          dark: "#0B3FAE",
        },
        status: {
          // Aligned to the "Loom Spatial Glass" operational status tokens.
          good: "#059669",
          warn: "#D97706",
          bad: "#E11D48",
          info: "#06B6D4",
          shortage: "#9333EA",
          rejected: "#E11D48",
          idle: "#64748B",
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
        // New keys, deliberately additive -  applied only inside the
        // authenticated layout shells (see AdminLayout/MdLayout/UserLayout),
        // never globally, so the sign-in page's typography is untouched.
        app: [
          "Plus Jakarta Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(16,24,40,0.04), 0 1px 3px 0 rgba(16,24,40,0.06)",
        popover: "0 20px 40px -10px rgba(16,24,40,0.2)",
        glow: "0 0 0 4px rgba(21,94,239,0.12)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #155EEF 0%, #2563EB 100%)",
        // Aligned to the "Loom Spatial Glass" operational status tokens.
        "good-gradient": "linear-gradient(135deg, #047857 0%, #059669 100%)",
        "warn-gradient": "linear-gradient(135deg, #B45309 0%, #D97706 100%)",
        "bad-gradient": "linear-gradient(135deg, #9F1239 0%, #E11D48 100%)",
        "dot-grid": "radial-gradient(circle, rgba(16,24,40,0.07) 1px, transparent 1px)",
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
        flowMove: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "28px 0" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 2s ease-in-out infinite",
        floatSlow: "floatSlow 6s ease-in-out infinite",
        fadeInUp: "fadeInUp 0.35s ease-out",
        flowMove: "flowMove 0.9s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
