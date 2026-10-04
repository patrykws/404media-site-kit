"use client"

import * as React from "react"

import type { Registry } from "./define-block"
import { blockLabels, SiteDocument, type ChromeComponents, type SiteDocumentProps } from "./render"
import { resolveHref, SiteProvider, type SiteContextValue } from "./site-context"
import { sampleBlock } from "./gallery"
import type { EntryRef, Page, SiteData, Theme } from "./types"

/** The real site, as visitors see it. Links navigate, nothing is editable. */
export function LiveSite({
  page,
  theme,
  site,
  registry,
  chrome,
  Document = SiteDocument,
  entry = null,
}: {
  page: Page
  /** Set: the detail page of this collection entry instead of the page's blocks. */
  entry?: EntryRef | null
  theme: Theme
  site: SiteData
  registry: Registry
  chrome: ChromeComponents
  /** The site's own document around header, page and footer. */
  Document?: React.ComponentType<SiteDocumentProps>
}) {
  const value = React.useMemo<SiteContextValue>(
    () => ({
      mode: "live",
      locale: "de",
      site,
      theme,
      selection: null,
      select: () => {},
      popups: () => {},
      edit: () => {},
      navigate: () => {},
      href: (target) => resolveHref(site, target),
    }),
    [site, theme]
  )
  const collection = entry ? registry.collection(entry.collection) : undefined
  return (
    <SiteProvider value={value}>
      <Document
        page={page}
        registry={registry}
        chrome={chrome}
        labels={blockLabels("de")}
        entry={entry && collection ? { collection, entry: entry.entry } : null}
      />
    </SiteProvider>
  )
}

const NO_CHROME: ChromeComponents = { Header: () => null, Footer: () => null }

/**
 * One block with its sample content and nothing around it — what the
 * editor's "Bausteine" tiles show, shrunk. The preview route renders it for
 * `?block=<type>` (see `galleryType`); pass `pages` and the tile shows the
 * block as the site really uses it (`sampleBlock`).
 */
export function BlockSample({
  type,
  pages,
  ...rest
}: { type: string; pages?: Page[] } & Omit<React.ComponentProps<typeof LiveSite>, "page" | "chrome">) {
  /* Tiles are pictures: no dev overlays, no reveal animations waiting for a scroll (preview.css). */
  React.useLayoutEffect(() => {
    document.documentElement.dataset.aqGallery = ""
  }, [])
  const page = React.useMemo<Page>(
    () => ({
      slug: "muster",
      title: "",
      path: "/muster",
      inMenu: false,
      status: "entwurf",
      createdBy: "martin",
      changedBy: "martin",
      changedAt: "",
      /* A fixed id: the server and the browser must render the same markup. */
      blocks: (() => {
        const block = pages ? sampleBlock(rest.registry, pages, type) : rest.registry.has(type) ? rest.registry.newBlock(type) : null
        return block ? [{ ...block, id: "muster", hidden: false }] : []
      })(),
    }),
    [type, rest.registry, pages]
  )
  return <LiveSite page={page} chrome={NO_CHROME} {...rest} />
}
