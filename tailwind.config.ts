import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Fraunces", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        paper: "var(--paper)",
        "paper-light": "var(--paper-light)",
        "paper-deep": "var(--paper-deep)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",
        saffron: "var(--saffron)",
        moss: "var(--moss)",
        rust: "var(--rust)",
      },
      letterSpacing: {
        wide2: "0.2em",
        wide3: "0.3em",
      },
    },
  },
  plugins: [],
} satisfies Config;
