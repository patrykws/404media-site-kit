"use client"

import * as React from "react"

import { popupSelection, type EditorPopup, type Locale, type Selection } from "./bridge"
import type { Block, Entry, SiteData, Theme } from "./types"

/**
 * What every block can read while it renders: the site around it, the mode
 * it is rendered in, and — inside the editor — how to report a click or an
 * inline edit.
 *
 *   live  — the real site on the client's domain; links navigate.
 *   view  — the preview with editing off; links tell the editor to switch page.
 *   edit  — the preview with editing on; text is editable, clicks select.
 */
export type SiteMode = "live" | "view" | "edit"

export type SiteContextValue = {
  mode: SiteMode
  locale: Locale
  site: SiteData
  theme: Theme
  selection: Selection
  /** The state the open pop-up is shown in (`EditorPopup.views`); null = its first. */
  view?: string | null
  select: (selection: Selection) => void
  edit: (blockId: string, field: string, value: string) => void
  navigate: (slug: string) => void
  /** Tells the editor which pop-ups the page has — use `useEditorPopups`. */
  popups: (popups: EditorPopup[]) => void
  /** Turns a link target (page slug, "tel", "mail") into an href. */
  href: (target: string) => string
}

const SiteContext = React.createContext<SiteContextValue | null>(null)

export function SiteProvider({
  value,
  children,
}: {
  value: SiteContextValue
  children: React.ReactNode
}) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite() {
  const ctx = React.useContext(SiteContext)
  if (!ctx) throw new Error("useSite must be used inside <SiteProvider>")
  return ctx
}

/** Lists the page's pop-ups in the editor's outline (edit mode only). */
export function useEditorPopups(popups: EditorPopup[]) {
  const ctx = React.useContext(SiteContext)
  const announce = ctx?.popups
  const key = JSON.stringify(ctx?.mode === "edit" ? popups : [])
  React.useEffect(() => {
    announce?.(JSON.parse(key) as EditorPopup[])
  }, [key, announce])
}

/**
 * Whether the editor has this pop-up open (its outline row is selected), and
 * how to report it closed. Always closed outside edit mode and outside a `SiteProvider`.
 * `view`: the state the editor shows it in (one of the `views` it announced), null = the first.
 */
export function usePopup(id: string) {
  /* Also outside a `SiteProvider` — a dialog the live site renders in its own layout. */
  const ctx = React.useContext(SiteContext)
  const open = ctx?.mode === "edit" && ctx.selection === popupSelection(id)
  const select = ctx?.select
  const close = React.useCallback(() => {
    if (open) select?.(null)
  }, [open, select])
  const view = open ? (ctx?.view ?? null) : null
  return { open, close, view }
}

/** The entries of one collection, newest first — drafts in the editor, published on the live site. */
export function useEntries(collection: string): Entry[] {
  return useSite().site.entries?.[collection] ?? []
}

export function resolveHref(site: SiteData, target: string) {
  if (target === "tel") return `tel:${site.info.phone.replace(/\s+/g, "")}`
  if (target === "mail") return `mailto:${site.info.email}`
  /* Addresses typed in full — another site, an anchor, a file, a phone number. */
  if (/^(https?:|mailto:|tel:|#|\/)/.test(target)) return target
  const entry = site.menu.find((page) => page.slug === target)
  const path = entry ? entry.path : `/${target}`
  return `${site.basePath}${path === "/" ? "" : path}` || "/"
}

/* ------------------------------------------------------------------ */
/* The block being rendered                                            */
/* ------------------------------------------------------------------ */

const BlockContext = React.createContext<Block | null>(null)

export function BlockProvider({ block, children }: { block: Block; children: React.ReactNode }) {
  return <BlockContext.Provider value={block}>{children}</BlockContext.Provider>
}

/** The block being rendered, or null outside one (header, footer). */
export function useMaybeBlock() {
  return React.useContext(BlockContext)
}

export function useBlock() {
  const block = React.useContext(BlockContext)
  if (!block) throw new Error("useBlock must be used inside a block")
  return block
}
