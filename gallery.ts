import type { Registry } from "./define-block"
import type { Block, Page } from "./types"

/*
 * The gallery mode of a site's preview route — plain functions, no React,
 * so a server component (the route itself) can call them.
 */

/**
 * The gallery mode of a site's preview route: `?block=<type>` (older
 * editors send `?sample=`) → the block type a "Bausteine" tile asks for.
 */
export function galleryType(params: Record<string, string | string[] | undefined>): string | null {
  const value = params.block ?? params.sample
  return typeof value === "string" && value ? value : null
}

/**
 * What a tile shows for a block type: the fullest block of that type on the
 * site's own pages (real texts and images), else the block's defaults.
 */
export function sampleBlock(registry: Registry, pages: Page[], type: string): Block | null {
  if (!registry.has(type)) return null
  let best: Block | null = null
  let size = 0
  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type !== type || block.hidden) continue
      const weight = JSON.stringify(block.props).length
      if (weight > size) {
        best = block
        size = weight
      }
    }
  }
  return best ? structuredClone(best) : registry.newBlock(type)
}

