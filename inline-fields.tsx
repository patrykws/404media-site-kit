"use client"

import * as React from "react"

import { getPath } from "./fields"
import { useMaybeBlock, useSite } from "./site-context"
import type { FieldDescriptor, ItemFieldDescriptor, SiteImage } from "./types"

/**
 * In-place text editing for blocks that draw finished markup (a site's own
 * section library) instead of `<Text>`: while editing, every element whose
 * text is exactly one of the block's text fields becomes editable. Typing
 * reports `aqtelo:edit` like `<Text>` does, so the panel, undo and saving
 * follow. While a text has focus the block's markup is frozen (React does
 * not touch what the person is typing in); on blur the markup is put back
 * as React left it and the block re-renders from the new value.
 *
 * Pictures and videos the same way: an `<img>`, `<video>`, inline
 * `background-image` or `[data-aq-src]` whose file is one of the block's
 * image or video fields gets `data-aq-media` — the preview host then offers
 * "replace" on it.
 *
 * Use: `<InlineFields fields={definition.fields}>{…the block's markup…}</InlineFields>`.
 * Outside a block (header, footer) pass `owner`: shared content by its key,
 * reported as `content:<key>`.
 * A field whose text the markup changes (joined with other text, shortened)
 * simply stays panel-only.
 */

type Kind = "line" | "lines" | "rich"
type Target = { path: string; kind: Kind; value: string; owner?: string }
type MediaKind = "image" | "video"
type MediaTarget = { path: string; kind: MediaKind; value: string; owner?: string }

const MARK = "data-aq-inline"

/** The text fields of a block, with their paths ("title", "slides.0.heading", "button.label"). */
function targets(
  fields: Record<string, FieldDescriptor | ItemFieldDescriptor>,
  props: Record<string, unknown>,
  prefix = "",
  media: MediaTarget[] = []
): Target[] {
  const out: Target[] = []
  for (const [key, field] of Object.entries(fields)) {
    const path = `${prefix}${key}`
    const value = getPath(props, path)
    switch (field.kind) {
      case "text":
        if (typeof value !== "string") break
        if (field.upload === "video") media.push({ path, kind: "video", value })
        else out.push({ path, kind: "line", value })
        break
      case "image":
        if (typeof value === "string" && value) media.push({ path, kind: "image", value })
        break
      case "longText":
        if (typeof value === "string") out.push({ path, kind: "lines", value })
        break
      case "richText":
        if (typeof value === "string") out.push({ path, kind: "rich", value })
        break
      case "link": {
        const label = (value as { label?: unknown } | undefined)?.label
        if (typeof label === "string") out.push({ path: `${path}.label`, kind: "line", value: label })
        break
      }
      case "list":
        if (Array.isArray(value))
          value.forEach((_, index) => out.push(...targets(field.item, props, `${path}.${index}.`, media)))
        break
    }
  }
  return out
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim()
const BLOCKS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6"])

/** What a plain text element says: line breaks from `<br>` and block elements, no CSS case changes. */
function plainText(node: Node): string {
  let out = ""
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue ?? ""
    else if (child instanceof HTMLBRElement) out += "\n"
    else if (child instanceof HTMLElement) {
      if (BLOCKS.has(child.tagName) && out && !out.endsWith("\n")) out += "\n"
      out += plainText(child)
    }
  })
  return out
}

const valueOf = (el: HTMLElement, kind: Kind) => {
  if (kind === "rich") return el.innerHTML
  const text = plainText(el).replace(/ /g, " ").replace(/\n+$/, "")
  return kind === "line" ? text.replace(/\s*\n\s*/g, " ") : text
}

/** An element of this root, not of an `InlineFields` nested in it (shared texts inside a block). */
const own = (root: HTMLElement, el: Element) => el.closest("[data-aq-inline-root]") === root

const SKIP = "script,style,svg,input,textarea,select,video,img,iframe,[data-aq-field]:not([data-aq-inline])"

/** Marks the elements that show a field's text exactly; returns nothing, sets attributes. */
function mark(root: HTMLElement, list: Target[]) {
  root.querySelectorAll(`[${MARK}]`).forEach((el) => {
    if (!own(root, el)) return
    el.removeAttribute(MARK)
    el.removeAttribute("data-aq-field")
    el.removeAttribute("contenteditable")
    el.removeAttribute("spellcheck")
    if (el.hasAttribute("data-aq-owner-auto")) {
      el.removeAttribute("data-aq-owner")
      el.removeAttribute("data-aq-owner-auto")
    }
  })
  /* Not inside a skipped element, and not around a field the markup edits itself (`<Text>`, a split sentence …). */
  const elements = Array.from(root.querySelectorAll<HTMLElement>("*")).filter(
    (el) => own(root, el) && !el.closest(SKIP) && !el.querySelector("[data-aq-field]:not([data-aq-inline]):not([data-aq-media])")
  )
  /* Each element's text once, not once per field. */
  const plain = new Map(elements.map((el) => [el, squash(plainText(el))]))
  const content = new Map(elements.map((el) => [el, squash(el.textContent ?? "")]))
  const claimed: HTMLElement[] = []
  const free = (el: HTMLElement) => !claimed.some((other) => other.contains(el) || el.contains(other))
  const found = list.map((target) => {
    let matches: HTMLElement[]
    let text: string
    if (target.kind === "rich") {
      const template = document.createElement("template")
      template.innerHTML = target.value
      text = squash(template.content.textContent ?? "")
      if (!text) return { target, text, matches: [] as HTMLElement[] }
      const tags = Array.from(template.content.children, (child) => child.tagName).join(",")
      const same = elements.filter((el) => content.get(el) === text)
      const shaped = same.filter((el) => Array.from(el.children, (child) => child.tagName).join(",") === tags)
      matches = tags && shaped.length ? shaped : same
    } else {
      text = squash(target.value)
      if (!text) return { target, text, matches: [] as HTMLElement[] }
      matches = elements.filter((el) => plain.get(el) === text)
    }
    /* The innermost element that still holds the whole text. */
    return { target, text, matches: matches.filter((el) => !matches.some((other) => other !== el && el.contains(other))) }
  })
  /* Fields with the same text (two equal slides, a list shown twice for a loop) share its
     elements in page order: the first element goes to the first field, the second to the second … */
  const siblings = new Map<string, number>()
  /* Grouped per owner: a block field and a shared text that read the same do not split the
     elements between them — the first (the block's own) takes them. */
  const groupOf = (target: Target, text: string) => `${target.owner ?? ""}\u0000${text}`
  for (const { target, text } of found) if (text) siblings.set(groupOf(target, text), (siblings.get(groupOf(target, text)) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const { target, text, matches } of found) {
    if (!text) continue
    const group = groupOf(target, text)
    const count = siblings.get(group) ?? 1
    const rank = seen.get(group) ?? 0
    seen.set(group, rank + 1)
    matches.forEach((el, index) => {
      if (index % count !== rank || !free(el)) return
      claimed.push(el)
      el.setAttribute(MARK, target.kind)
      el.setAttribute("data-aq-field", target.path)
      el.setAttribute("contenteditable", target.kind === "rich" ? "true" : "plaintext-only")
      el.setAttribute("spellcheck", "false")
      if (target.owner) {
        el.setAttribute("data-aq-owner", target.owner)
        el.setAttribute("data-aq-owner-auto", "")
      }
    })
  }
}

/* ------------------------------------------------------------------ */
/* Pictures and videos                                                 */
/* ------------------------------------------------------------------ */

const MEDIA = "data-aq-media"

/** One spelling per file: same-origin path, Next's image optimiser unwrapped, no query. */
function fileKey(raw: string | null | undefined): string {
  if (!raw) return ""
  try {
    const url = new URL(raw.trim(), window.location.href)
    if (url.pathname.endsWith("/_next/image")) return fileKey(url.searchParams.get("url"))
    const path = decodeURIComponent(url.pathname)
    return url.origin === window.location.origin ? path : `${url.origin}${path}`
  } catch {
    return ""
  }
}

const backgroundUrl = (el: HTMLElement) => /url\((['"]?)(.*?)\1\)/.exec(el.style.backgroundImage)?.[2]

/** The files an element shows: its source, every srcset candidate, a background, a hint. */
function filesOf(el: HTMLElement): string[] {
  const out: string[] = []
  const add = (raw: string | null | undefined) => {
    const key = fileKey(raw)
    if (key) out.push(key)
  }
  if (el instanceof HTMLImageElement) {
    add(el.getAttribute("src"))
    add(el.currentSrc)
    el.srcset.split(",").forEach((candidate) => add(candidate.trim().split(/\s+/)[0]))
  } else if (el instanceof HTMLVideoElement) {
    add(el.getAttribute("src"))
    add(el.currentSrc)
    add(el.getAttribute("poster"))
    el.querySelectorAll("source").forEach((source) => {
      add(source.getAttribute("src"))
      add(source.dataset.src)
    })
  }
  add(el.dataset.src)
  add(el.dataset.aqSrc)
  add(backgroundUrl(el))
  return out
}

function markMedia(root: HTMLElement, list: MediaTarget[], images: SiteImage[]) {
  root.querySelectorAll(`[${MEDIA}][data-aq-media-auto]`).forEach((el) => {
    if (!own(root, el)) return
    el.removeAttribute(MEDIA)
    el.removeAttribute("data-aq-media-kind")
    el.removeAttribute("data-aq-media-auto")
    if (el.hasAttribute("data-aq-owner-auto")) {
      el.removeAttribute("data-aq-owner")
      el.removeAttribute("data-aq-owner-auto")
    }
  })
  if (!list.length) return
  const wanted = list.map((target) => ({
    ...target,
    key: fileKey(images.find((image) => image.id === target.value)?.url ?? target.value),
  }))
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("img, video, [style*='background-image'], [data-aq-src], [data-src]")).filter((el) => own(root, el))
  /* Same rule as texts: fields showing the same file share its elements in page order. */
  const byKey = new Map<string, typeof wanted>()
  for (const target of wanted) if (target.key) byKey.set(target.key, [...(byKey.get(target.key) ?? []), target])
  const hits = new Map<string, number>()
  candidates.forEach((el) => {
    if (el.hasAttribute(MEDIA) || el.parentElement?.closest(`[${MEDIA}]`)) return
    const files = filesOf(el)
    const key = files.find((file) => byKey.has(file))
    if (!key) return
    const group = byKey.get(key)!
    const index = hits.get(key) ?? 0
    hits.set(key, index + 1)
    const hit = group[index % group.length]
    el.setAttribute(MEDIA, hit.path)
    el.setAttribute("data-aq-media-kind", hit.kind)
    el.setAttribute("data-aq-media-auto", "")
    if (hit.owner) {
      el.setAttribute("data-aq-owner", hit.owner)
      el.setAttribute("data-aq-owner-auto", "")
    }
  })
}

/** Every node under `el` as React left it, to put back after typing. */
function snapshot(el: HTMLElement) {
  const children = new Map<Node, Node[]>()
  const texts = new Map<Node, string | null>()
  const walk = (node: Node) => {
    children.set(node, Array.from(node.childNodes))
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) texts.set(child, child.nodeValue)
      else walk(child)
    })
  }
  walk(el)
  return () => {
    texts.forEach((value, node) => {
      node.nodeValue = value
    })
    children.forEach((nodes, node) => (node as Element).replaceChildren(...nodes))
  }
}

function insertPlain(text: string, multiline: boolean) {
  const lines = (multiline ? text.replace(/\r/g, "").split("\n") : [text.replace(/\s*\n\s*/g, " ")])
  lines.forEach((line, index) => {
    if (index > 0) insertBreak()
    if (line) document.execCommand("insertText", false, line)
  })
}

/** A line break at the caret; a second one when it lands at the very end, or the new line would not show. */
function insertBreak() {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const br = document.createElement("br")
  range.insertNode(br)
  const host = br.parentNode
  let next = br.nextSibling
  while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue) next = next.nextSibling
  if (!next && host) host.appendChild(document.createElement("br"))
  range.setStartAfter(br)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function InlineFields({
  fields,
  owner,
  shared,
  children,
}: {
  fields: Record<string, FieldDescriptor | ItemFieldDescriptor>
  /** Shared content instead of the surrounding block: its key and value. */
  owner?: { key: string; value: Record<string, unknown> }
  /**
   * Shared content the markup also shows (a campaign headline, prices, the team inside a
   * block): its texts become editable too and are reported as `content:<key>`. A `list`
   * content's value is its array of items. The block's own fields win on equal text.
   */
  shared?: { key: string; fields: Record<string, FieldDescriptor | ItemFieldDescriptor>; value: unknown }[]
  children: React.ReactNode
}) {
  const { mode, edit, site } = useSite()
  const surrounding = useMaybeBlock()
  const block = owner ? { id: `content:${owner.key}`, props: owner.value } : surrounding
  if (!block) throw new Error("InlineFields needs a block or an owner")
  const root = React.useRef<HTMLDivElement>(null)
  /* While a text has focus the markup stays exactly as it was: same element, React skips it. */
  const [frozen, setFrozen] = React.useState<{ node: React.ReactNode } | null>(null)
  const isFrozen = React.useRef(false)
  const editing = mode === "edit"

  const latest = React.useRef({ block, fields, shared, edit, children, images: site.images })
  React.useEffect(() => {
    latest.current = { block, fields, shared, edit, children, images: site.images }
  })

  const scan = React.useCallback(() => {
    const el = root.current
    if (!el || isFrozen.current) return
    const { block, fields, shared, images } = latest.current
    const media: MediaTarget[] = []
    const list = editing ? targets(fields, block.props, "", media) : []
    if (editing) {
      for (const source of shared ?? []) {
        const owner = `content:${source.key}`
        const items = Array.isArray(source.value) ? source.value : [source.value]
        items.forEach((item, index) => {
          const prefix = Array.isArray(source.value) ? `${index}.` : ""
          const itemMedia: MediaTarget[] = []
          const found = targets(source.fields, (item ?? {}) as Record<string, unknown>, "", itemMedia)
          list.push(...found.map((t) => ({ ...t, path: prefix + t.path, owner })))
          media.push(...itemMedia.map((m) => ({ ...m, path: prefix + m.path, owner })))
        })
      }
    }
    mark(el, list)
    markMedia(el, media, images)
  }, [editing])

  /* After every render, and again once the section's own effects (sliders, clones) have run. */
  React.useLayoutEffect(() => {
    scan()
    const timer = window.setTimeout(scan, 250)
    return () => window.clearTimeout(timer)
  })

  React.useEffect(() => {
    const el = root.current
    if (!el || !editing) return
    let restore: (() => void) | null = null
    let dirty = false
    /* Markup that appears later (a scroll scene's next step, a slider's clone) is marked once
       it settles — not only when the pointer passes, which never happens over a scene's
       `pointer-events: none` layers. */
    let settle = 0
    const observer = new MutationObserver(() => {
      if (isFrozen.current) return
      dirty = true
      window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        if (!dirty || isFrozen.current) return
        dirty = false
        scan()
      }, 200)
    })
    observer.observe(el, { childList: true, subtree: true, characterData: true })

    const field = (target: EventTarget | null) => {
      const text = target instanceof Element ? target.closest<HTMLElement>(`[${MARK}]`) : null
      return text && own(el, text) ? text : null
    }
    const report = (text: HTMLElement) => {
      const kind = text.getAttribute(MARK) as Kind
      const path = text.getAttribute("data-aq-field")
      const target = text.getAttribute("data-aq-owner-auto") !== null ? text.getAttribute("data-aq-owner") : null
      if (path) latest.current.edit(target ?? latest.current.block.id, path, valueOf(text, kind))
    }
    const unfreeze = () => {
      if (!isFrozen.current) return
      restore?.()
      restore = null
      isFrozen.current = false
      setFrozen(null)
    }

    const onOver = () => {
      if (!dirty) return
      dirty = false
      scan()
    }
    const onFocusIn = (event: FocusEvent) => {
      const text = field(event.target)
      if (!text || isFrozen.current) return
      isFrozen.current = true
      restore = snapshot(text)
      setFrozen({ node: latest.current.children })
    }
    const onFocusOut = (event: FocusEvent) => {
      if (field(event.target)) unfreeze()
    }
    /* The editor's panel took the keyboard: let go, so the panel's changes show. */
    const onWindowBlur = () => {
      const active = document.activeElement
      if (active instanceof HTMLElement && field(active)) active.blur()
      unfreeze()
    }
    const onInput = (event: Event) => {
      const text = field(event.target)
      if (text) report(text)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const text = field(event.target)
      if (!text) return
      const kind = text.getAttribute(MARK) as Kind
      if (event.key === "Escape") {
        text.blur()
        return
      }
      if (event.key !== "Enter" || kind === "rich") return
      event.preventDefault()
      if (kind === "line") {
        text.blur()
        return
      }
      insertBreak()
      report(text)
    }
    const onPaste = (event: ClipboardEvent) => {
      const text = field(event.target)
      if (!text) return
      event.preventDefault()
      insertPlain(event.clipboardData?.getData("text/plain") ?? "", text.getAttribute(MARK) !== "line")
      report(text)
    }
    /* A text inside a link or button: edit it, never follow it. The block's own click still selects it. */
    const onClick = (event: MouseEvent) => {
      if (field(event.target)) event.preventDefault()
    }

    el.addEventListener("pointerover", onOver)
    el.addEventListener("focusin", onFocusIn)
    el.addEventListener("focusout", onFocusOut)
    el.addEventListener("input", onInput)
    el.addEventListener("keydown", onKeyDown)
    el.addEventListener("paste", onPaste)
    el.addEventListener("click", onClick)
    window.addEventListener("blur", onWindowBlur)
    return () => {
      observer.disconnect()
      window.clearTimeout(settle)
      el.removeEventListener("pointerover", onOver)
      el.removeEventListener("focusin", onFocusIn)
      el.removeEventListener("focusout", onFocusOut)
      el.removeEventListener("input", onInput)
      el.removeEventListener("keydown", onKeyDown)
      el.removeEventListener("paste", onPaste)
      el.removeEventListener("click", onClick)
      window.removeEventListener("blur", onWindowBlur)
      unfreeze()
    }
  }, [editing, scan])

  return (
    <div ref={root} data-aq-inline-root="" data-aq-owner={owner ? block.id : undefined} style={{ display: "contents" }}>
      {frozen ? frozen.node : children}
    </div>
  )
}
