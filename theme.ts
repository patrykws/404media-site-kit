import type { FontChoice, Theme, ThemeSpec } from "./types"

/**
 * The site-wide design. Stored as JSON on the platform, rendered as CSS
 * variables on the site's root element — Tailwind utilities in the site
 * read those variables (`@theme inline`), so a change is live without a build.
 */

export const FONTS: FontChoice[] = [
  { name: "Inter", google: "Inter:wght@400;500;600;700", fallback: "system-ui, sans-serif", kind: "sans" },
  { name: "Source Sans 3", google: "Source+Sans+3:wght@400;600;700", fallback: "system-ui, sans-serif", kind: "sans" },
  { name: "Work Sans", google: "Work+Sans:wght@400;500;600;700", fallback: "system-ui, sans-serif", kind: "sans" },
  { name: "Manrope", google: "Manrope:wght@400;500;600;700", fallback: "system-ui, sans-serif", kind: "sans" },
  { name: "DM Sans", google: "DM+Sans:wght@400;500;600;700", fallback: "system-ui, sans-serif", kind: "sans" },
  { name: "Figtree", google: "Figtree:wght@400;500;600;700", fallback: "system-ui, sans-serif", kind: "sans" },
  { name: "Nunito", google: "Nunito:wght@400;600;700", fallback: "system-ui, sans-serif", kind: "sans" },
  { name: "IBM Plex Sans", google: "IBM+Plex+Sans:wght@400;500;600", fallback: "system-ui, sans-serif", kind: "sans" },
  { name: "Fraunces", google: "Fraunces:opsz,wght@9..144,400..700", fallback: "Georgia, serif", kind: "serif" },
  { name: "Playfair Display", google: "Playfair+Display:wght@400;600;700", fallback: "Georgia, serif", kind: "serif" },
  { name: "Lora", google: "Lora:wght@400;500;600;700", fallback: "Georgia, serif", kind: "serif" },
  { name: "Merriweather", google: "Merriweather:wght@400;700", fallback: "Georgia, serif", kind: "serif" },
]

export const THEME_SPEC: ThemeSpec = {
  colors: [
    { key: "primary", label: { de: "Hauptfarbe", en: "Brand colour" } },
    { key: "ink", label: { de: "Text", en: "Text" } },
    { key: "surface", label: { de: "Hintergrund", en: "Background" } },
    { key: "surfaceAlt", label: { de: "Hintergrund, getönt", en: "Background, tinted" } },
    { key: "dark", label: { de: "Dunkle Abschnitte", en: "Dark sections" } },
  ],
  fonts: FONTS,
  scale: {
    bases: [15, 16, 17, 18, 19],
    ratios: [
      { value: 1.2, label: { de: "Ruhig", en: "Calm" } },
      { value: 1.25, label: { de: "Normal", en: "Normal" } },
      { value: 1.333, label: { de: "Kräftig", en: "Bold" } },
    ],
  },
  radii: [0, 4, 8, 16],
}

export const DEFAULT_THEME: Theme = {
  colors: {
    primary: "#1f5a44",
    ink: "#1a1a1a",
    surface: "#ffffff",
    surfaceAlt: "#f3f4f1",
    dark: "#132a20",
  },
  onPrimary: "hell",
  fonts: { heading: "Fraunces", body: "Source Sans 3" },
  scale: { base: 17, ratio: 1.25 },
  spacing: "normal",
  radius: 4,
  buttons: "eckig",
}

const SPACE: Record<Theme["spacing"], number> = { kompakt: 0.8, normal: 1, luftig: 1.3 }

export const fontByName = (name: string) =>
  FONTS.find((font) => font.name === name) ?? FONTS[0]

const family = (name: string) => {
  const font = fontByName(name)
  return `"${font.name}", ${font.fallback}`
}

/** The CSS custom properties the site reads. One string, ready for a style attribute. */
export function themeVars(theme: Theme): Record<string, string> {
  const { colors, scale } = theme
  const step = (n: number) => `${(scale.base * Math.pow(scale.ratio, n)).toFixed(2)}px`
  return {
    "--site-primary": colors.primary,
    "--site-on-primary": theme.onPrimary === "hell" ? "#ffffff" : colors.ink,
    "--site-ink": colors.ink,
    "--site-surface": colors.surface,
    "--site-surface-alt": colors.surfaceAlt,
    "--site-dark": colors.dark,
    "--site-on-dark": "#ffffff",
    "--site-font-heading": family(theme.fonts.heading),
    "--site-font-body": family(theme.fonts.body),
    "--site-text-0": `${scale.base}px`,
    "--site-text-1": step(1),
    "--site-text-2": step(2),
    "--site-text-3": step(3),
    "--site-text-4": step(4),
    "--site-text-5": step(5),
    "--site-text-6": step(6),
    "--site-space": String(SPACE[theme.spacing]),
    "--site-radius": `${theme.radius}px`,
    "--site-radius-button": theme.buttons === "rund" ? "999px" : `${theme.radius}px`,
  }
}

export function themeCss(theme: Theme, selector = ":root") {
  const vars = Object.entries(themeVars(theme))
    .map(([key, value]) => `${key}:${value};`)
    .join("")
  return `${selector}{${vars}}`
}

/** The Google Fonts stylesheet for the two families of a theme. */
export function fontsHref(theme: Theme) {
  const names = [...new Set([theme.fonts.heading, theme.fonts.body])]
  const families = names.map((name) => `family=${fontByName(name).google}`).join("&")
  return `https://fonts.googleapis.com/css2?${families}&display=swap`
}

export function applyThemeToDocument(theme: Theme, doc: Document) {
  const root = doc.documentElement
  for (const [key, value] of Object.entries(themeVars(theme))) root.style.setProperty(key, value)
  loadFonts(theme, doc)
}

/** Adds (or swaps) the Google Fonts stylesheet for the theme's two families. */
export function loadFonts(theme: Theme, doc: Document) {
  const href = fontsHref(theme)
  let link = doc.querySelector<HTMLLinkElement>("link[data-site-fonts]")
  if (!link) {
    link = doc.createElement("link")
    link.rel = "stylesheet"
    link.dataset.siteFonts = ""
    doc.head.appendChild(link)
  }
  if (link.href !== href) link.href = href
}
