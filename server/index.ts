import "server-only"

import { createHash } from "node:crypto"

import { revalidateTag } from "next/cache"

import type { Entry, Page, SiteImage, SiteInfo, Theme } from "../types"
import { KIT_VERSION } from "../version"

/**
 * The server half of the kit: how a site on its own domain talks to the
 * 404media platform. One `createPlatform` per site (`src/editor/platform.ts`);
 * its routes are one line each:
 *
 *   export const { GET } = platform.manifestRoute(manifest)
 *   export const { GET } = platform.seedRoute((origin) => seedBundle(origin))
 *   export const { POST } = platform.revalidateRoute()
 *
 * Reading what is published: the platform (`PLATFORM_URL` + `PLATFORM_TOKEN`)
 * in parts — core, then one answer per collection, each small enough for the
 * fetch cache — cached until the platform calls the revalidate route. When the
 * platform does not answer: its copy in Vercel Blob (written by the platform's
 * `mirror.ts`), then the seed the site moved over with.
 */

export type Bundle = {
  pages: Page[]
  content: Record<string, unknown>
  media: SiteImage[]
  /** Published entries per collection key, newest first. */
  entries?: Record<string, Entry[]>
  info: SiteInfo | null
  theme?: Theme
}

/** True when the bundle is the seed, not the platform: the content is then exactly the code's. */
export type LoadedBundle = Bundle & { seeded: boolean }

export const PLATFORM_TAG = "platform"

/** Where the platform keeps each site's copy — the origin of the store `404media-editor-media`. */
const MIRROR_ORIGIN = "https://jxswsklsk24ydgsb.public.blob.vercel-storage.com"

export type PlatformOptions = {
  /** The site's id in the editor (its business's slug). */
  siteId: string
  /** What the site renders when neither the platform nor its copy answers. */
  seed: () => Bundle
}

const usable = (bundle: Partial<Bundle> | null | undefined): bundle is Bundle =>
  Boolean(bundle && Array.isArray(bundle.pages) && bundle.pages.length > 0)

export function createPlatform({ siteId, seed }: PlatformOptions) {
  /** The shared secret; on a laptop a fixed development value stands in. */
  const platformToken = () => {
    const token = process.env.PLATFORM_TOKEN
    if (token) return token
    return process.env.NODE_ENV === "production" ? null : `dev-${siteId}`
  }

  const platformUrl = () => process.env.PLATFORM_URL?.replace(/\/$/, "") ?? null

  function isPlatform(request: Request) {
    const token = platformToken()
    const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
    if (!token || given.length !== token.length) return false
    let diff = 0
    for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i)
    return diff === 0
  }

  /* Said once a minute, not on every request, when the platform is away. */
  let lastComplaint = 0
  function complain(message: string, error?: unknown) {
    if (Date.now() - lastComplaint < 60_000) return
    lastComplaint = Date.now()
    console.error(`[platform] ${message}`, error ?? "")
  }

  async function ask<T>(url: string, token: string, init: { cache?: "no-store" }): Promise<T> {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      ...(init.cache ? { cache: init.cache } : { next: { tags: [PLATFORM_TAG], revalidate: 3600 } }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`platform answered ${response.status}`)
    return (await response.json()) as T
  }

  /** Core first, then every non-empty collection in parallel; any failure fails the whole read. */
  async function fromPlatform(url: string, token: string, init: { cache?: "no-store" }): Promise<Bundle> {
    const base = `${url}/api/sites/${siteId}/published`
    const core = await ask<Bundle & { collections?: Record<string, number> }>(`${base}?part=core`, token, init)
    /* A platform from before the parts answers with everything at once. */
    if (!core.collections) return core
    const { collections, ...rest } = core
    const keys = Object.entries(collections).filter(([, count]) => count > 0).map(([key]) => key)
    const lists = await Promise.all(
      keys.map((key) => ask<{ entries: Entry[] }>(`${base}?part=${encodeURIComponent(`entries/${key}`)}`, token, init))
    )
    const entries: Record<string, Entry[]> = Object.fromEntries(Object.keys(collections).map((key) => [key, []]))
    keys.forEach((key, i) => (entries[key] = lists[i].entries))
    return { ...rest, entries }
  }

  async function fromMirror(token: string): Promise<Bundle | null> {
    const hash = createHash("sha256").update(token).digest("hex").slice(0, 32)
    try {
      const response = await fetch(`${MIRROR_ORIGIN}/mirror/${siteId}-${hash}.json`, {
        next: { tags: [PLATFORM_TAG], revalidate: 300 },
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return null
      const bundle = (await response.json()) as Bundle
      return usable(bundle) ? bundle : null
    } catch {
      return null
    }
  }

  /** What the live site renders. */
  async function getBundle(): Promise<LoadedBundle> {
    const url = platformUrl()
    const token = process.env.PLATFORM_TOKEN
    if (url && token) {
      try {
        const bundle = await fromPlatform(url, token, {})
        if (usable(bundle)) return { ...bundle, seeded: false }
        complain("platform answered without pages — trying the copy")
      } catch (error) {
        complain("platform unreachable — trying the copy", error)
      }
      const copy = await fromMirror(token)
      if (copy) return { ...copy, seeded: false }
      complain("no copy either — rendering the seed")
    }
    return { ...seed(), seeded: true }
  }

  /** Straight from the platform, past every cache; null when it does not answer (no copy, no seed). */
  async function getFreshBundle(): Promise<Bundle | null> {
    const url = platformUrl()
    const token = process.env.PLATFORM_TOKEN
    if (!url || !token) return null
    try {
      const bundle = await fromPlatform(url, token, { cache: "no-store" })
      return usable(bundle) ? bundle : null
    } catch {
      return null
    }
  }

  const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 })

  return {
    siteId,
    platformToken,
    isPlatform,
    getBundle,
    getFreshBundle,

    /** `GET /api/editor/manifest` — the blocks and shared content the editor offers, and the kit version the site runs. */
    manifestRoute: (manifest: object) => ({
      GET: () => Response.json({ ...manifest, kitVersion: KIT_VERSION }, { headers: { "cache-control": "no-store" } }),
    }),

    /** `GET /api/editor/seed` — what the platform starts the site from (asked once, with the secret). */
    seedRoute: (bundle: (origin: string) => unknown) => ({
      GET: (request: Request) => {
        if (!isPlatform(request)) return unauthorized()
        return Response.json(bundle(new URL(request.url).origin))
      },
    }),

    /**
     * `POST /api/editor/revalidate` — called after every publish: the next
     * visitor gets the new content. `then` runs the site's own extra steps.
     */
    revalidateRoute: (then?: () => void | Promise<void>) => ({
      POST: async (request: Request) => {
        if (!isPlatform(request)) return unauthorized()
        revalidateTag(PLATFORM_TAG, { expire: 0 })
        await then?.()
        return Response.json({ revalidated: true })
      },
    }),
  }
}

export type Platform = ReturnType<typeof createPlatform>

/**
 * Where the 404media editor runs — the only window the preview talks to.
 * Null in production without `EDITOR_ORIGIN`: then there is no preview.
 */
export function editorOrigin() {
  const origin = process.env.EDITOR_ORIGIN?.replace(/\/$/, "")
  if (origin) return origin
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3002"
}
