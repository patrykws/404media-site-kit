"use client"

import * as React from "react"

import type { Registry } from "./define-block"
import { BlockProvider, useSite } from "./site-context"
import type { Block, CollectionType, Entry, Page } from "./types"

/**
 * A page = its blocks, top to bottom, each wrapped so the editor can find
 * it (`data-aq-block`), outline it and name it. Hidden blocks are skipped
 * for visitors and shown dimmed while editing.
 */
export function RenderPage({
  page,
  registry,
  className,
  stack,
}: {
  page: Page
  registry: Registry
  className?: string
  /** Each section paints above the one before it — for sections that overlap the previous one. */
  stack?: boolean
}) {
  const { mode, selection, select, locale } = useSite()
  const editing = mode === "edit"

  return (
    <main
      className={className}
      data-aq-page={page.slug}
      onClick={editing ? () => select(null) : undefined}
    >
      {page.blocks.map((block, index) => {
        if (block.hidden && !editing) return null
        const definition = registry.get(block.type)
        if (!definition) return null
        const Component = definition.component as React.ComponentType<{
          props: Record<string, unknown>
          options: Record<string, string>
          block: Block
        }>
        return (
          <div
            key={block.id}
            id={`aq-${block.id}`}
            data-aq-block={block.id}
            data-aq-type={block.type}
            data-aq-label={definition.label[locale]}
            data-aq-selected={editing && selection === block.id ? "" : undefined}
            data-aq-hidden={block.hidden ? "" : undefined}
            style={stack ? { position: "relative", zIndex: index + 1 } : undefined}
            onClick={
              editing
                ? (event) => {
                    event.stopPropagation()
                    select(block.id)
                  }
                : undefined
            }
          >
            <BlockProvider block={block}>
              <Component props={block.props} options={block.options} block={block} />
            </BlockProvider>
          </div>
        )
      })}
    </main>
  )
}

/** Header and footer: same on every page, selectable while editing. */
export function FixedPart({
  part,
  label,
  children,
}: {
  part: "header" | "footer"
  label: string
  children: React.ReactNode
}) {
  const { mode, selection, select } = useSite()
  const editing = mode === "edit"
  return (
    <div
      id={`aq-${part}`}
      data-aq-fixed={part}
      data-aq-label={label}
      data-aq-selected={editing && selection === part ? "" : undefined}
      onClick={
        editing
          ? (event) => {
              event.stopPropagation()
              select(part)
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

export type ChromeComponents = {
  Header: React.ComponentType<{ current: string }>
  Footer: React.ComponentType
  /** The detail page of a collection entry (a news post …); the site switches on `collection.key`. */
  Entry?: React.ComponentType<{ collection: CollectionType; entry: Entry }>
}

export type SiteDocumentProps = {
  page: Page
  registry: Registry
  chrome: ChromeComponents
  labels: { header: string; footer: string }
  /** Set: the document shows this entry's detail page instead of the page's blocks. */
  entry?: { collection: CollectionType; entry: Entry } | null
}

/** Header, page, footer — the whole document body of one page. A site with its own frame around them passes its own `Document`. */
export function SiteDocument({ page, registry, chrome, labels, entry }: SiteDocumentProps) {
  const { Header, Footer } = chrome
  return (
    <>
      <FixedPart part="header" label={labels.header}>
        <Header current={entry?.collection.listPage ?? page.slug} />
      </FixedPart>
      {entry ? <RenderEntry {...entry} chrome={chrome} /> : <RenderPage page={page} registry={registry} />}
      <FixedPart part="footer" label={labels.footer}>
        <Footer />
      </FixedPart>
    </>
  )
}

/** A collection entry's detail page, drawn by the site's `chrome.Entry`. */
export function RenderEntry({
  collection,
  entry,
  chrome,
}: {
  collection: CollectionType
  entry: Entry
  chrome: ChromeComponents
}) {
  const Detail = chrome.Entry
  return (
    <main data-aq-entry={entry.id} data-aq-collection={collection.key}>
      {Detail ? <Detail collection={collection} entry={entry} /> : null}
    </main>
  )
}

export const blockLabels = (locale: "de" | "en") =>
  locale === "de"
    ? { header: "Kopfzeile", footer: "Fußzeile" }
    : { header: "Header", footer: "Footer" }

export type { Block }
