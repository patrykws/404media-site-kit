import type { EntryRef, Page, SiteData, Theme } from "./types"

/**
 * The messages between the editor (parent window) and the site's preview
 * route (iframe). The site never learns anything about the app's UI; the
 * editor never touches the site's DOM.
 */

export type PreviewMode = "edit" | "view"
export type Locale = "de" | "en"

/** Header and footer are selectable too — they just explain where to edit. A pop-up is `popup:<id>`. */
export type Selection = string | "header" | "footer" | null

/**
 * A dialog of the site (contact form, application form …) listed in the
 * editor's outline after the footer. Selecting it (`popup:<id>`) opens it in
 * the frame; `content` names the shared content its texts belong to.
 */
export type EditorPopup = {
  id: string
  label: string
  content?: string
  /**
   * The states the editor can show it in — a form's "Formular", "Danke", "Fehler",
   * a stepper's steps. The first is the default; the open one reaches the site as `usePopup(id).view`.
   */
  views?: { id: string; label: string }[]
}

export const popupSelection = (id: string) => `popup:${id}`

export type EditorToSite =
  | {
      type: "aqtelo:init"
      mode: PreviewMode
      locale: Locale
      page: Page
      theme: Theme
      site: SiteData
      selection: Selection
      /** A collection entry to show as its detail page instead of the page's blocks. */
      entry?: EntryRef | null
    }
  | { type: "aqtelo:page"; page: Page }
  | { type: "aqtelo:theme"; theme: Theme }
  | { type: "aqtelo:site"; site: SiteData }
  /** The entry being edited (a news post …) — its detail page follows every keystroke. */
  | { type: "aqtelo:entry"; entry: EntryRef | null }
  | { type: "aqtelo:mode"; mode: PreviewMode }
  | { type: "aqtelo:locale"; locale: Locale }
  | { type: "aqtelo:select"; selection: Selection }
  /** The state the open pop-up shows (`EditorPopup.views`); null = its first. */
  | { type: "aqtelo:view"; view: string | null }
  | { type: "aqtelo:scrollTo"; selection: Exclude<Selection, null>; align?: "start" | "center" }
  /** Scrolls the page by this many pixels — while a block is dragged over it. */
  | { type: "aqtelo:scrollBy"; top: number }

export type Rect = { id: string; top: number; height: number }

/** A shortcut pressed while the frame had focus (outside a text field). */
export type KeyPress = { key: string; meta: boolean; shift: boolean; alt: boolean }

export type SiteToEditor =
  | { type: "aqtelo:ready" }
  | { type: "aqtelo:select"; selection: Selection }
  /** The block under the pointer (null: none) — the editor hangs hover controls on it. */
  | { type: "aqtelo:hover"; blockId: string | null }
  | { type: "aqtelo:edit"; blockId: string; field: string; value: string }
  /**
   * A text or picture on the page was clicked: the panel shows that field.
   * `replace` — the person pressed "replace" on a picture or video: open its picker.
   * `blockId` is a block's id, or `content:<key>` for shared content (header, footer).
   */
  | { type: "aqtelo:field"; blockId: string; field: string; replace: boolean }
  | { type: "aqtelo:navigate"; slug: string }
  /** The pop-ups of the page shown (edit mode only; empty otherwise). */
  | { type: "aqtelo:popups"; popups: EditorPopup[] }
  | ({ type: "aqtelo:key" } & KeyPress)
  | {
      type: "aqtelo:layout"
      blocks: Rect[]
      header: Rect
      footer: Rect
      scrollTop: number
      scrollHeight: number
      viewportHeight: number
    }

export const isEditorMessage = (data: unknown): data is EditorToSite =>
  typeof data === "object" &&
  data !== null &&
  typeof (data as { type?: unknown }).type === "string" &&
  (data as { type: string }).type.startsWith("aqtelo:")

export const isSiteMessage = (data: unknown): data is SiteToEditor => isEditorMessage(data)
