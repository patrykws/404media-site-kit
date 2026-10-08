"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import {
  isEditorMessage,
  type Locale,
  type PreviewMode,
  type Selection,
  type SiteToEditor,
} from "./bridge"
import type { Registry } from "./define-block"
import { blockLabels, SiteDocument, type ChromeComponents, type SiteDocumentProps } from "./render"
import { resolveHref, SiteProvider, type SiteContextValue } from "./site-context"
import { applyThemeToDocument } from "./theme"
import type { EntryRef, Page, SiteData, Theme } from "./types"

/**
 * The site's preview route renders this. It shows whatever the editor
 * (the parent window) sends — page, theme, site data, mode — and reports
 * back clicks, inline edits, navigation and where every block sits, so the
 * editor can draw its controls on top of the frame.
 *
 * The route that renders it also imports `site-kit/preview.css` (outlines,
 * name chips) — kept out of this module so the kit's barrel carries no CSS.
 */
export function PreviewHost({
  registry,
  chrome,
  Document = SiteDocument,
  initial,
  editorOrigin = "*",
  themed = true,
}: {
  registry: Registry
  chrome: ChromeComponents
  /** The site's own document around header, page and footer. */
  Document?: React.ComponentType<SiteDocumentProps>
  initial: { page: Page; theme: Theme; site: SiteData; entry?: EntryRef | null }
  /** Origin of the editor; "*" while app and site share a host. */
  editorOrigin?: string
  /** false: the site's design is fixed in code; the theme's variables and fonts stay out. */
  themed?: boolean
}) {
  const [page, setPage] = React.useState(initial.page)
  const [theme, setTheme] = React.useState(initial.theme)
  const [site, setSite] = React.useState(initial.site)
  const [entry, setEntry] = React.useState<EntryRef | null>(initial.entry ?? null)
  const [mode, setMode] = React.useState<PreviewMode>("edit")
  const [locale, setLocale] = React.useState<Locale>("de")
  const [selection, setSelection] = React.useState<Selection>(null)
  const [view, setView] = React.useState<string | null>(null)

  const post = React.useCallback(
    (message: SiteToEditor) => {
      if (window.parent === window) return
      window.parent.postMessage(message, editorOrigin)
    },
    [editorOrigin]
  )

  /* Theme and mode live on the root element: CSS variables and a data attribute. */
  React.useLayoutEffect(() => {
    if (themed) applyThemeToDocument(theme, document)
  }, [theme, themed])
  React.useLayoutEffect(() => {
    document.documentElement.dataset.aqMode = mode
  }, [mode])

  /* Another page (or entry) opens at its top, not where the last one was scrolled to. */
  const shown = `${page.slug}\u0000${entry?.collection ?? ""}\u0000${entry?.entry.id ?? ""}`
  const lastShown = React.useRef(shown)
  React.useLayoutEffect(() => {
    if (lastShown.current === shown) return
    lastShown.current = shown
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [shown])

  /* Where everything sits — after every render, on resize and on scroll. */
  const report = React.useCallback(() => {
    const scrollTop = window.scrollY
    const rect = (el: Element | null, id: string) => {
      if (!el) return { id, top: 0, height: 0 }
      const r = el.getBoundingClientRect()
      return { id, top: r.top + scrollTop, height: r.height }
    }
    const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-aq-block]")).map((el) =>
      rect(el, el.dataset.aqBlock ?? "")
    )
    post({
      type: "aqtelo:layout",
      blocks,
      header: rect(document.querySelector("[data-aq-fixed='header']"), "header"),
      footer: rect(document.querySelector("[data-aq-fixed='footer']"), "footer"),
      scrollTop,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    })
  }, [post])

  React.useLayoutEffect(() => {
    report()
  })

  React.useEffect(() => {
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(report)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      cancelAnimationFrame(raf)
    }
  }, [report])

  /* Which block the pointer is over — the editor draws hover controls (a link to the CMS) for it. */
  React.useEffect(() => {
    if (mode !== "edit") return
    let current: string | null = null
    const send = (next: string | null) => {
      if (next === current) return
      current = next
      post({ type: "aqtelo:hover", blockId: next })
    }
    const onOver = (event: MouseEvent) => {
      const block = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-aq-block]") : null
      send(block?.dataset.aqBlock ?? null)
    }
    const onLeave = () => send(null)
    document.addEventListener("mouseover", onOver)
    document.documentElement.addEventListener("mouseleave", onLeave)
    return () => {
      document.removeEventListener("mouseover", onOver)
      document.documentElement.removeEventListener("mouseleave", onLeave)
    }
  }, [mode, post])

  /*
   * Shortcuts pressed while the frame has focus (a click into the page puts
   * it there) go to the editor, which owns undo, selection and the like.
   * Text fields keep their keys; the frame only forwards what it never uses.
   */
  const keyState = React.useRef({ mode, selection })
  React.useEffect(() => {
    keyState.current = { mode, selection }
  })
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (keyState.current.mode !== "edit") return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return
      const meta = event.metaKey || event.ctrlKey
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const command = meta && ["z", "s", "d"].includes(key)
      const selectionKey = ["Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown"].includes(key)
      if (!command && !selectionKey) return
      /* Arrows and delete only mean something with a selection; otherwise the page scrolls as usual. */
      if (selectionKey && key !== "Escape" && !keyState.current.selection) return
      event.preventDefault()
      post({ type: "aqtelo:key", key, meta, shift: event.shiftKey, alt: event.altKey })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [post])

  /*
   * While someone types into a text on the page, the page and the site data the
   * editor sends back (the same letters, echoed) wait until they leave that text:
   * re-rendering under the caret rewrote the text and threw the caret to the start.
   */
  const held = React.useRef<{ page?: Page; site?: SiteData }>({})
  React.useEffect(() => {
    const flush = () =>
      window.setTimeout(() => {
        if (typingNow()) return
        const { page, site } = held.current
        held.current = {}
        if (page) setPage(page)
        if (site) setSite(site)
      }, 0)
    document.addEventListener("focusout", flush, true)
    window.addEventListener("blur", flush)
    return () => {
      document.removeEventListener("focusout", flush, true)
      window.removeEventListener("blur", flush)
    }
  }, [])

  /* Messages from the editor. */
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !isEditorMessage(event.data)) return
      if (editorOrigin !== "*" && event.origin !== editorOrigin) return
      const message = event.data
      switch (message.type) {
        case "aqtelo:init":
          held.current = {}
          setPage(message.page)
          setTheme(message.theme)
          setSite(message.site)
          setMode(message.mode)
          setLocale(message.locale)
          setSelection(message.selection)
          if (message.entry !== undefined) setEntry(message.entry)
          break
        case "aqtelo:entry":
          setEntry(message.entry)
          break
        case "aqtelo:page":
          if (typingNow()) held.current.page = message.page
          else setPage(message.page)
          break
        case "aqtelo:theme":
          setTheme(message.theme)
          break
        case "aqtelo:site":
          if (typingNow()) held.current.site = message.site
          else setSite(message.site)
          break
        case "aqtelo:mode":
          setMode(message.mode)
          if (message.mode === "view") setSelection(null)
          break
        case "aqtelo:locale":
          setLocale(message.locale)
          break
        case "aqtelo:select":
          setSelection(message.selection)
          setView(null)
          break
        case "aqtelo:view":
          setView(message.view)
          break
        case "aqtelo:scrollTo":
          document
            .getElementById(`aq-${message.selection}`)
            ?.scrollIntoView({ block: message.align ?? "start", behavior: "smooth" })
          break
        case "aqtelo:scrollBy":
          window.scrollBy({ top: message.top })
          break
      }
    }
    window.addEventListener("message", onMessage)
    post({ type: "aqtelo:ready" })
    return () => window.removeEventListener("message", onMessage)
  }, [post, editorOrigin])

  const value = React.useMemo<SiteContextValue>(
    () => ({
      mode,
      locale,
      site,
      theme,
      selection,
      view,
      select: (next) => {
        setSelection(next)
        post({ type: "aqtelo:select", selection: next })
      },
      edit: (blockId, field, text) => post({ type: "aqtelo:edit", blockId, field, value: text }),
      navigate: (slug) => post({ type: "aqtelo:navigate", slug }),
      popups: (popups) => post({ type: "aqtelo:popups", popups }),
      href: (target) => resolveHref(site, target),
    }),
    [mode, locale, site, theme, selection, view, post]
  )

  const collection = entry ? registry.collection(entry.collection) : undefined
  return (
    <SiteProvider value={value}>
      {mode === "edit" ? <MediaControls locale={locale} post={post} resetKey={page.slug} /> : null}
      <Document
        page={page}
        registry={registry}
        chrome={chrome}
        labels={blockLabels(locale)}
        entry={entry && collection ? { collection, entry: entry.entry } : null}
      />
    </SiteProvider>
  )
}

/* ------------------------------------------------------------------ */
/* Pictures and videos: click one, "replace" opens its picker          */
/* ------------------------------------------------------------------ */

type Found = { el: HTMLElement; owner: string; field: string; kind: string }

/** Whose field it is: shared content (`data-aq-owner`) or the block around it. */
function ownerOf(el: Element) {
  const owner = el.closest<HTMLElement>("[data-aq-owner]")?.dataset.aqOwner
  return owner ?? el.closest<HTMLElement>("[data-aq-block]")?.dataset.aqBlock ?? null
}

/**
 * The picture or video under the pointer — found by its box, so overlays,
 * canvases and `pointer-events: none` pictures do not hide it; the smallest
 * one wins. A text on top (one that can be typed into) keeps the click.
 */
function mediaAt(x: number, y: number): Found | null {
  const top = document.elementFromPoint(x, y)
  if (top?.closest("[data-aq-media-ui]")) return null
  if (top instanceof HTMLElement && top.isContentEditable) return null
  let best: Found | null = null
  let bestArea = Infinity
  document.querySelectorAll<HTMLElement>("[data-aq-media]").forEach((el) => {
    const r = box(el)
    if (x < r.left || x > r.left + r.width || y < r.top || y > r.top + r.height) return
    const area = r.width * r.height
    if (area >= bestArea || area < 4) return
    if (!seen(el)) return
    const owner = ownerOf(el)
    if (!owner) return
    best = { el, owner, field: el.dataset.aqMedia ?? "", kind: el.dataset.aqMediaKind ?? "image" }
    bestArea = area
  })
  return best
}

/** Not faded out: a scroll scene's hidden cards (opacity 0, `visibility: hidden`) must not take the pointer. */
const seen = (el: HTMLElement) => {
  if (getComputedStyle(el).visibility === "hidden") return false
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    if (Number(getComputedStyle(node).opacity) < 0.05) return false
  }
  return true
}

const box = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  /* Only the visible part: a picture larger than its frame (zoom, parallax) is clipped by the frame. */
  let top = r.top, left = r.left, right = r.right, bottom = r.bottom
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.overflow === "visible" && style.overflowX === "visible" && style.overflowY === "visible") continue
    const c = node.getBoundingClientRect()
    top = Math.max(top, c.top); left = Math.max(left, c.left); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom)
  }
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

function MediaControls({ locale, post, resetKey }: { locale: Locale; post: (message: SiteToEditor) => void; resetKey: string }) {
  const [hover, setHover] = React.useState<Found | null>(null)
  const [active, setActive] = React.useState<Found | null>(null)
  const [, tick] = React.useReducer((n: number) => n + 1, 0)

  const [shownFor, setShownFor] = React.useState(resetKey)
  if (shownFor !== resetKey) {
    setShownFor(resetKey)
    setActive(null)
  }

  React.useEffect(() => {
    let raf = 0
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const found = mediaAt(event.clientX, event.clientY)
        setHover((prev) => (prev?.el === found?.el ? prev : found))
      })
    }
    const onLeave = () => setHover(null)
    /* Capture: blocks stop their clicks from bubbling. */
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-aq-media-ui]")) return
      const found = mediaAt(event.clientX, event.clientY)
      setActive(found)
      if (found) post({ type: "aqtelo:field", blockId: found.owner, field: found.field, replace: false })
    }
    /* Typing into a text: the panel follows to the same field. */
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target
      if (!(el instanceof HTMLElement) || !el.isContentEditable) return
      const text = el.closest<HTMLElement>("[data-aq-field]")
      const owner = text && ownerOf(text)
      if (text && owner) post({ type: "aqtelo:field", blockId: owner, field: text.dataset.aqField ?? "", replace: false })
    }
    document.addEventListener("pointermove", onMove, { passive: true })
    document.documentElement.addEventListener("mouseleave", onLeave)
    document.addEventListener("click", onClick, true)
    document.addEventListener("focusin", onFocusIn)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("pointermove", onMove)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("focusin", onFocusIn)
    }
  }, [post])

  /* Follow the element while the page scrolls, moves or animates. */
  React.useEffect(() => {
    if (!hover && !active) return
    let raf = 0
    const loop = () => {
      tick()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [hover, active])

  const shown = [active, hover && hover.el !== active?.el ? hover : null].filter((item): item is Found => !!item && item.el.isConnected)
  if (!shown.length) return null
  const de = locale === "de"
  return createPortal(
    <div data-aq-media-ui="">
      {shown.map((item) => {
        const r = box(item.el)
        if (r.width < 2 || r.height < 2) return null
        const isActive = item === active
        const label = item.kind === "video" ? (de ? "Video ersetzen" : "Replace video") : de ? "Bild ersetzen" : "Replace picture"
        return (
          <div
            key={isActive ? "active" : "hover"}
            className="aq-media-box"
            data-active={isActive ? "" : undefined}
            /* Too small for the button inside (a logo): it sits under the picture. */
            data-small={r.width < 160 || r.height < 64 ? "" : undefined}
            style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
          >
            {isActive ? (
              <button
                type="button"
                className="aq-media-replace"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  post({ type: "aqtelo:field", blockId: item.owner, field: item.field, replace: true })
                }}
              >
                {label}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>,
    document.body
  )
}

/** True while the person types into a text of this page (the frame has the keyboard). */
function typingNow() {
  const active = document.activeElement
  return document.hasFocus() && active instanceof HTMLElement && active.isContentEditable
}
