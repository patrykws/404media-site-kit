"use client"

import * as React from "react"

import { entryPath } from "./collection"
import { getPath } from "./fields"
import { useBlock, useSite } from "./site-context"
import type { CollectionType, Entry, LinkValue } from "./types"

/**
 * The three things a block renders from its fields. In `edit` mode they
 * become editable in place and report every change to the editor; in the
 * other modes they are plain markup.
 */

type TextTag = "h1" | "h2" | "h3" | "p" | "span" | "div" | "b" | "figcaption"

/** Text with plain-text inline editing. `field` is a path like "title" or "items.0.quote". */
export function Text({
  field,
  as = "p",
  className,
  multiline,
}: {
  field: string
  as?: TextTag
  className?: string
  /** Enter inserts a line break instead of ending the edit. */
  multiline?: boolean
}) {
  const { mode, edit, selection, select } = useSite()
  const block = useBlock()
  const value = String(getPath(block.props, field) ?? "")
  const ref = React.useRef<HTMLElement | null>(null)
  /* The initial text goes in once; afterwards the DOM is the source while
     the element has focus, and the store is the source when it does not. */
  /* One object for the element's whole life: React 19 rewrites innerHTML whenever this
     prop is a new object, which put the text back to its first value on every update —
     typed letters vanished, a button that loaded empty went blank on click. */
  const [html] = React.useState(() => ({ __html: escapeHtml(value) }))

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    /* The frame keeps its focused element after the editor's panel takes the
       keyboard — only a text the person is typing in right now is left alone. */
    const typingHere = document.activeElement === el && document.hasFocus()
    if (!typingHere && el.textContent !== value) el.textContent = value
  }, [value])

  const Tag = as as keyof React.JSX.IntrinsicElements
  if (mode !== "edit") {
    return React.createElement(Tag, { className }, value)
  }

  return React.createElement(Tag, {
    ref,
    className,
    contentEditable: "plaintext-only",
    suppressContentEditableWarning: true,
    spellCheck: false,
    "data-aq-field": field,
    dangerouslySetInnerHTML: html,
    /* A text never goes blank on click: when it shows nothing although the store has text, put it back. */
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      const el = event.currentTarget
      if (!el.textContent && value) {
        el.textContent = value
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    },
    onInput: (event: React.FormEvent<HTMLElement>) =>
      edit(block.id, field, event.currentTarget.textContent ?? ""),
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.currentTarget.blur()
        return
      }
      if (event.key === "Enter" && !multiline) {
        event.preventDefault()
        event.currentTarget.blur()
      }
    },
    onPaste: (event: React.ClipboardEvent<HTMLElement>) => {
      event.preventDefault()
      const text = event.clipboardData.getData("text/plain")
      document.execCommand("insertText", false, multiline ? text : text.replace(/\s*\n\s*/g, " "))
    },
    /* Typing into a text also selects its section, so the panel shows the same field. */
    onClick: (event: React.MouseEvent) => {
      event.stopPropagation()
      if (selection !== block.id) select(block.id)
    },
  })
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** A button or link driven by a `link` field. Nothing renders when the label is empty. */
export function Action({ field, className }: { field: string; className: string }) {
  const { mode, href, navigate, edit } = useSite()
  const block = useBlock()
  const value = (getPath(block.props, field) ?? { label: "", target: "" }) as LinkValue
  if (!value.label && mode !== "edit") return null

  if (mode === "edit") {
    return (
      <span className={className} data-aq-action={value.label ? undefined : "empty"}>
        <Text field={`${field}.label`} as="span" />
        {value.label ? null : (
          <span
            className="aq-action-placeholder"
            onClick={(event) => {
              event.stopPropagation()
              edit(block.id, `${field}.label`, "Button")
            }}
          >
            + Button
          </span>
        )}
      </span>
    )
  }

  const target = href(value.target)
  const isPage = value.target !== "tel" && value.target !== "mail"
  return (
    <a
      href={target}
      className={className}
      onClick={(event) => {
        if (mode === "view" && isPage) {
          event.preventDefault()
          navigate(value.target)
        }
      }}
    >
      {value.label}
    </a>
  )
}

/** An image from the client's library, by id. */
export function Picture({
  field,
  className,
  imgClassName,
  alt,
}: {
  field: string
  className?: string
  imgClassName?: string
  alt?: string
}) {
  const { site } = useSite()
  const block = useBlock()
  const id = String(getPath(block.props, field) ?? "")
  const image = site.images.find((item) => item.id === id) ?? site.images[0]
  if (!image) return null
  return (
    <span className={className} data-aq-field={field} data-aq-media={field} data-aq-media-kind="image">
      {/* Client library images live on their own host; no next/image on purpose. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt={alt ?? image.alt ?? ""} className={imgClassName} loading="lazy" draggable={false} />
    </span>
  )
}

/** A link in the fixed chrome (header, footer) that behaves per mode. */
export function SiteLink({
  target,
  className,
  children,
  ...rest
}: {
  target: string
  className?: string
  children: React.ReactNode
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target">) {
  const { mode, href, navigate } = useSite()
  const isPage = target !== "tel" && target !== "mail"
  if (mode === "edit") {
    return (
      <span className={className} aria-current={rest["aria-current"]}>
        {children}
      </span>
    )
  }
  return (
    <a
      {...rest}
      href={href(target)}
      className={className}
      onClick={(event) => {
        if (mode === "view" && isPage) {
          event.preventDefault()
          navigate(target)
        }
      }}
    >
      {children}
    </a>
  )
}

/**
 * A link to an entry's detail page (a news post …). Live it navigates; in
 * the editor's preview it stays put — the editor opens entries itself.
 */
export function EntryLink({
  collection,
  entry,
  className,
  children,
  ...rest
}: {
  collection: CollectionType
  entry: Pick<Entry, "slug">
  className?: string
  children: React.ReactNode
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target">) {
  const { mode, site } = useSite()
  if (mode === "edit") return <span className={className}>{children}</span>
  return (
    <a
      {...rest}
      href={`${site.basePath}${entryPath(collection, entry)}`}
      className={className}
      onClick={mode === "view" ? (event) => event.preventDefault() : undefined}
    >
      {children}
    </a>
  )
}
