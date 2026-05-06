import type { Config } from "tailwindcss";

function nlColor(name: string) {
  return `rgb(var(--nl-${name}) / <alpha-value>)`;
}

export default {
  content: [
    "./client/index.html",
    "./client/src/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        surface: {
          DEFAULT: nlColor("surface"),
          dim: nlColor("surface-dim"),
          raised: nlColor("surface-raised"),
          inset: nlColor("surface-inset"),
        },
        fg: {
          DEFAULT: nlColor("text"),
          secondary: nlColor("text-secondary"),
          muted: nlColor("text-muted"),
          faint: nlColor("text-faint"),
        },
        nl: {
          border: nlColor("border"),
          "border-input": nlColor("border-input"),
          ring: nlColor("ring"),
          divider: nlColor("divider"),
          primary: nlColor("primary"),
          "on-primary": nlColor("on-primary"),
          "primary-hover": nlColor("primary-hover"),
          hover: nlColor("hover"),
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
