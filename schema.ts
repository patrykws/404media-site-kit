import { z } from "zod"

import type { Registry } from "./define-block"
import { SLUG_PATTERN } from "./collection"
import type { Block, CollectionType, ContentType, Entry, FieldDescriptor, ManifestBlock, Page } from "./types"

/**
 * Validation — the kit's only use of zod. Kept out of `define-block` /
 * `fields` and out of the `@/site-kit` barrel on purpose: those are imported
 * by every block, so anything here would ship (~100 KB gzipped) to every
 * visitor. Server code that validates imports from `@/site-kit/schema`.
 */

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export function schemaForField(field: FieldDescriptor): z.ZodType {
  switch (field.kind) {
    case "text":
    case "longText":
    case "image":
    case "richText":
      return z.string()
    case "link":
      return z.object({ label: z.string(), target: z.string() })
    case "boolean":
      return z.boolean()
    case "number":
      return z.number()
    case "date":
      return field.optional
        ? z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "expected a date (YYYY-MM-DD)")
        : z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected a date (YYYY-MM-DD)")
    case "select": {
      const values = field.choices.map((choice) => choice.value)
      return z.string().refine((value) => values.includes(value) || (field.optional === true && value === ""), {
        message: `expected one of ${values.join(", ")}`,
      })
    }
    case "reference":
      return field.optional ? z.string() : z.string().min(1, "choose an entry")
    case "references":
      return z.array(z.string()).max(field.max)
    case "file":
      return z.object({
        url: field.optional ? z.string() : z.string().min(1, "upload a file"),
        name: z.string(),
        size: z.number(),
      })
    case "list": {
      const shape: Record<string, z.ZodType> = { id: z.string() }
      for (const [key, item] of Object.entries(field.item)) shape[key] = schemaForField(item)
      return z.array(z.object(shape)).min(field.min).max(field.max)
    }
  }
}

export function schemaForFields(fields: Record<string, FieldDescriptor>) {
  const shape: Record<string, z.ZodType> = {}
  for (const [key, field] of Object.entries(fields)) shape[key] = schemaForField(field)
  return z.object(shape)
}

/* ------------------------------------------------------------------ */
/* Manifest-only validation — what the platform runs without the code  */
/* ------------------------------------------------------------------ */

export function validateAgainstManifest(manifest: ManifestBlock, block: Block) {
  const errors: string[] = []
  const props = schemaForFields(manifest.fields).safeParse(block.props)
  if (!props.success) {
    for (const issue of props.error.issues) errors.push(`${issue.path.join(".")}: ${issue.message}`)
  }
  for (const [key, opt] of Object.entries(manifest.options)) {
    const value = block.options?.[key]
    if (!opt.choices.some((choice) => choice.value === value)) {
      errors.push(`option ${key}: "${value}" is not one of ${opt.choices.map((c) => c.value).join(", ")}`)
    }
  }
  return errors.length === 0 ? { ok: true as const } : { ok: false as const, errors }
}

export function validateContent(type: ContentType, value: unknown) {
  const item = schemaForFields(type.fields)
  const schema = type.kind === "single" ? item : z.array(item.extend({ id: z.string() }))
  const result = schema.safeParse(value)
  if (result.success) return { ok: true as const }
  return {
    ok: false as const,
    errors: result.error.issues.map((issue) => `${type.key}.${issue.path.join(".")}: ${issue.message}`),
  }
}

export const pageSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  path: z.string().startsWith("/"),
  inMenu: z.boolean(),
  status: z.enum(["veroeffentlicht", "entwurf"]),
  createdBy: z.string(),
  changedBy: z.string(),
  changedAt: z.string(),
  seo: z
    .object({ title: z.string().optional(), description: z.string().optional(), noindex: z.boolean().optional() })
    .optional(),
  blocks: z.array(
    z.object({
      id: z.string().min(1),
      type: z.string().min(1),
      props: z.record(z.string(), z.unknown()),
      options: z.record(z.string(), z.string()),
      hidden: z.boolean().optional(),
      locked: z.boolean().optional(),
      changedBy: z.string().optional(),
      changedAt: z.string().optional(),
      agentReason: z.object({ de: z.string(), en: z.string() }).optional(),
    })
  ),
})

function manifestFor(registry: Registry, type: string): ManifestBlock | undefined {
  return registry.manifest().blocks.find((block) => block.type === type)
}

/** One block against its registry entry. */
export function validateBlock(registry: Registry, block: Block) {
  const manifest = manifestFor(registry, block.type)
  if (!manifest) return { ok: false as const, errors: [`unknown block type "${block.type}"`] }
  return validateAgainstManifest(manifest, block)
}

/** Every block of a page against the registry. */
export function validatePage(registry: Registry, page: Page) {
  const errors: string[] = []
  for (const block of page.blocks) {
    const result = validateBlock(registry, block)
    if (!result.ok) errors.push(...result.errors.map((e) => `${block.id}: ${e}`))
  }
  return errors.length === 0 ? { ok: true as const } : { ok: false as const, errors }
}

/** What publishing a collection entry requires: a title, an address, and every field in shape. */
export function validateEntry(type: CollectionType, entry: Entry) {
  const errors: string[] = []
  if (!SLUG_PATTERN.test(entry.slug)) errors.push("slug: use lowercase letters, digits and dashes")
  const title = entry.fields[type.titleField]
  if (typeof title !== "string" || !title.trim()) errors.push(`${type.titleField}: required`)
  const result = schemaForFields(type.fields).safeParse(entry.fields)
  if (!result.success) {
    for (const issue of result.error.issues) errors.push(`${issue.path.join(".")}: ${issue.message}`)
  }
  return errors.length === 0 ? { ok: true as const } : { ok: false as const, errors }
}
