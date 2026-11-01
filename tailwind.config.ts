import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
        colors: {
            border: "hsl(var(--border))",
            input: "hsl(var(--input))",
            ring: "hsl(var(--ring))",
            background: "hsl(var(--background))",
            foreground: "hsl(var(--foreground))",
            "shadcn-primary": {
              DEFAULT: "hsl(var(--primary))",
              foreground: "hsl(var(--primary-foreground))",
            },
            "shadcn-secondary": {
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
            "outline-variant": "#434653",
            "secondary-container": "#3131c0",
            "on-error-container": "#ffdad6",
            "inverse-surface": "#e2e2eb",
            "on-surface": "#e2e2eb",
            "on-primary": "#002c70",
            "on-tertiary-fixed-variant": "#743500",
            "surface-bright": "#373940",
            "surface-container-lowest": "#0c0e14",
            "on-tertiary": "#522300",
            "on-secondary-fixed": "#07006c",
            "background": "#111319",
            "outline": "#8d909e",
            "tertiary-container": "#ab5100",
            "surface-container": "#1d1f26",
            "primary": "#b1c5ff",
            "on-secondary": "#1000a9",
            "tertiary-fixed-dim": "#ffb68a",
            "surface": "#111319",
            "surface-variant": "#33343b",
            "on-secondary-container": "#b0b2ff",
            "primary-fixed-dim": "#b1c5ff",
            "inverse-primary": "#2259bf",
            "secondary": "#c0c1ff",
            "on-surface-variant": "#c3c6d5",
            "on-background": "#e2e2eb",
            "surface-container-low": "#191b22",
            "on-primary-fixed": "#001946",
            "surface-container-high": "#282a30",
            "on-secondary-fixed-variant": "#2f2ebe",
            "tertiary": "#ffb68a",
            "surface-tint": "#b1c5ff",
            "primary-fixed": "#d9e2ff",
            "error-container": "#93000a",
            "on-primary-fixed-variant": "#00419d",
            "on-tertiary-container": "#ffe8db",
            "on-error": "#690005",
            "on-primary-container": "#e7ebff",
            "surface-container-highest": "#33343b",
            "error": "#ffb4ab",
            "inverse-on-surface": "#2e3037",
            "secondary-fixed-dim": "#c0c1ff",
            "primary-container": "#3366cc",
            "secondary-fixed": "#e1e0ff",
            "surface-dim": "#111319",
            "on-tertiary-fixed": "#321300",
            "tertiary-fixed": "#ffdbc8"
        },
        borderRadius: {
            "DEFAULT": "0.125rem",
            "lg": "0.25rem",
            "xl": "0.5rem",
            "full": "0.75rem"
        },
        spacing: {
            "gutter": "16px",
            "unit": "4px",
            "element-gap-standard": "1rem",
            "element-gap-dense": "0.5rem",
            "container-padding": "1.5rem",
            "sidebar-width": "260px"
        },
        fontFamily: {
            "headline-md": ["Inter"],
            "doc-body": ["Noto Serif"],
            "code-sm": ["JetBrains Mono"],
            "body-lg": ["Inter"],
            "headline-lg": ["Inter"],
            "label-md": ["Inter"],
            "body-md": ["Inter"],
            "body-sm": ["Inter"],
            "headline-sm": ["Inter"]
        },
        fontSize: {
            "headline-md": ["24px", {"lineHeight": "32px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
            "doc-body": ["16px", {"lineHeight": "26px", "fontWeight": "400"}],
            "code-sm": ["12px", {"lineHeight": "16px", "fontWeight": "400"}],
            "body-lg": ["16px", {"lineHeight": "24px", "fontWeight": "400"}],
            "headline-lg": ["30px", {"lineHeight": "36px", "letterSpacing": "-0.02em", "fontWeight": "600"}],
            "label-md": ["12px", {"lineHeight": "16px", "letterSpacing": "0.02em", "fontWeight": "500"}],
            "body-md": ["14px", {"lineHeight": "20px", "fontWeight": "400"}],
            "body-sm": ["13px", {"lineHeight": "18px", "fontWeight": "400"}],
            "headline-sm": ["18px", {"lineHeight": "24px", "fontWeight": "600"}]
        }
    },
  },
  plugins: [
    require('@tailwindcss/container-queries')
  ],
} satisfies Config
