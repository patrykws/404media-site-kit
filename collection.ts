import { emptyValue } from "./fields"
import type { CollectionType, Entry, EntrySeo, FieldDescriptor, ItemFieldDescriptor, Text } from "./types"

/**
 * Collections: entries that each get a page of their own — news today,
 * insights, events, jobs, products later. The site declares one with
 * `defineCollection` (fields from the block vocabulary) and hands it to
 * `createRegistry(…, { collections })`; the platform keeps a draft and a
 * published copy per entry and delivers the published ones, newest first,
 * as `site.entries[key]`.
 */

export function defineCollection<const F extends Record<string, ItemFieldDescriptor>>(type: {
  key: string
  label: Text
  itemLabel: Text
  description?: Text
  fields: F
  titleField: keyof F & string
  dateField?: keyof F & string
  orderField?: keyof F & string
  columns?: (keyof F & string)[]
  path: `/${string}`
  listPage?: string
}): CollectionType {
  return type
}

/** "Neues Büro in Linz!" → "neues-buero-in-linz". Titles are cut at 80 characters. */
export function slugify(text: string, max = 80): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "")
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** A value of the right kind for the field, or the field's empty value. */
function coerce(field: FieldDescriptor, value: unknown): unknown {
  if (value === undefined || value === null) return emptyValue(field)
  const empty = emptyValue(field)
  if (Array.isArray(empty)) return Array.isArray(value) ? value : empty
  if (typeof empty === "object") return typeof value === "object" ? value : empty
  return typeof value === typeof empty ? value : empty
}

/** The entry filled to its full shape: every declared field present, the slug tidied. */
export function normaliseEntry(type: CollectionType, input: unknown): Entry {
  const record = (input && typeof input === "object" ? input : {}) as Partial<Entry>
  const given = (record.fields && typeof record.fields === "object" ? record.fields : {}) as Record<string, unknown>
  const fields: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(type.fields)) fields[key] = coerce(field, given[key])
  const title = typeof fields[type.titleField] === "string" ? (fields[type.titleField] as string) : ""
  /* A slug someone set (or an imported post brought along) keeps its length — its address is already out there. */
  const ownSlug = typeof record.slug === "string" && record.slug.trim() ? record.slug : null
  const seo = normaliseSeo(record.seo)
  return {
    id: String(record.id ?? ""),
    slug: ownSlug ? slugify(ownSlug, 200) : slugify(title),
    fields,
    ...(seo ? { seo } : {}),
  }
}

/** Only the texts someone filled in; nothing at all when all are empty. */
function normaliseSeo(input: unknown): EntrySeo | null {
  if (!input || typeof input !== "object") return null
  const source = input as Record<string, unknown>
  const seo: EntrySeo = {}
  for (const key of ["title", "description", "image"] as const) {
    const value = source[key]
    if (typeof value === "string" && value.trim()) seo[key] = value.trim()
  }
  return Object.keys(seo).length ? seo : null
}

/** By the order field (lowest first) when there is one, then newest first by the date field, then by title. */
export function sortEntries(type: CollectionType, entries: Entry[]): Entry[] {
  const order = (entry: Entry) => {
    const value = type.orderField ? entry.fields[type.orderField] : 0
    return typeof value === "number" && Number.isFinite(value) ? value : 0
  }
  const date = (entry: Entry) => (type.dateField ? String(entry.fields[type.dateField] ?? "") : "")
  const title = (entry: Entry) => String(entry.fields[type.titleField] ?? "")
  return [...entries].sort((a, b) => order(a) - order(b) || date(b).localeCompare(date(a)) || title(a).localeCompare(title(b)))
}

/**
 * The entries a `reference` / `references` field points to, in the field's
 * order; ids whose entry is gone (deleted, or offline on the live site) drop out.
 */
export function referenced(entries: Entry[] | undefined, ids: unknown): Entry[] {
  const list = Array.isArray(ids) ? ids : typeof ids === "string" && ids ? [ids] : []
  return list.flatMap((id) => entries?.find((entry) => entry.id === id) ?? [])
}

/**
 * Public path of an entry's detail page, without the site's base path.
 * `path: "/"` puts entries at the top level ("/<slug>") — for sites whose
 * posts always lived there (BHDT).
 */
export const entryPath = (type: CollectionType, entry: Pick<Entry, "slug">) =>
  `${type.path.replace(/\/+$/, "")}/${entry.slug}`
