import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        heading: ["Source Serif 4", "Georgia", "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        "tier-one": {
          DEFAULT: "hsl(var(--tier-one-surface))",
          border: "hsl(var(--tier-one-border))",
          foreground: "hsl(var(--tier-one-foreground))",
        },
        "tier-mid": {
          DEFAULT: "hsl(var(--tier-mid-surface))",
          border: "hsl(var(--tier-mid-border))",
          foreground: "hsl(var(--tier-mid-foreground))",
        },
        "tier-startup": {
          DEFAULT: "hsl(var(--tier-startup-surface))",
          border: "hsl(var(--tier-startup-border))",
          foreground: "hsl(var(--tier-startup-foreground))",
        },
        "resource-companies": {
          DEFAULT: "hsl(var(--resource-companies-surface))",
          border: "hsl(var(--resource-companies-border))",
          foreground: "hsl(var(--resource-companies-foreground))",
        },
        "resource-compensation": {
          DEFAULT: "hsl(var(--resource-compensation-surface))",
          border: "hsl(var(--resource-compensation-border))",
          foreground: "hsl(var(--resource-compensation-foreground))",
        },
        "company-mark": {
          1: "hsl(var(--company-mark-1))", 2: "hsl(var(--company-mark-2))",
          3: "hsl(var(--company-mark-3))", 4: "hsl(var(--company-mark-4))",
          5: "hsl(var(--company-mark-5))", 6: "hsl(var(--company-mark-6))",
          7: "hsl(var(--company-mark-7))", 8: "hsl(var(--company-mark-8))",
          9: "hsl(var(--company-mark-9))", 10: "hsl(var(--company-mark-10))",
          11: "hsl(var(--company-mark-11))", 12: "hsl(var(--company-mark-12))",
          13: "hsl(var(--company-mark-13))", 14: "hsl(var(--company-mark-14))",
          15: "hsl(var(--company-mark-15))", 16: "hsl(var(--company-mark-16))",
        },
        "mastery-beginner": "hsl(var(--mastery-beginner))",
        "mastery-progressing": "hsl(var(--mastery-progressing))",
        "mastery-proficient": "hsl(var(--mastery-proficient))",
        "mastery-expert": "hsl(var(--mastery-expert))",
        "mastery-movedup": "hsl(var(--mastery-movedup))",
        "openings-band": {
          DEFAULT: "hsl(var(--openings-band))",
          foreground: "hsl(var(--openings-band-foreground))",
        },
        "common-prompts": {
          DEFAULT: "hsl(var(--common-prompts))",
          border: "hsl(var(--common-prompts-border))",
        },
        "career-rounds-surface": "hsl(var(--career-rounds-surface))",
        "career-round-1": {
          DEFAULT: "hsl(var(--career-round-1))",
          foreground: "hsl(var(--career-round-1-foreground))",
          border: "hsl(var(--career-round-1-border))",
        },
        "career-round-2": {
          DEFAULT: "hsl(var(--career-round-2))",
          foreground: "hsl(var(--career-round-2-foreground))",
          border: "hsl(var(--career-round-2-border))",
        },
        "career-round-3": {
          DEFAULT: "hsl(var(--career-round-3))",
          foreground: "hsl(var(--career-round-3-foreground))",
          border: "hsl(var(--career-round-3-border))",
        },
        "career-round-4": {
          DEFAULT: "hsl(var(--career-round-4))",
          foreground: "hsl(var(--career-round-4-foreground))",
          border: "hsl(var(--career-round-4-border))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;