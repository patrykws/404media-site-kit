import type * as React from "react"

import { emptyValue, uid, type InferProps } from "./fields"
import type {
  Block,
  BlockSource,
  CollectionType,
  ContentType,
  ThemeSpec,
  FieldDescriptor,
  ItemFieldDescriptor,
  ListItem,
  Manifest,
  ManifestBlock,
  OptionDescriptor,
  Text,
} from "./types"
import { THEME_SPEC } from "./theme"

/**
 * `defineBlock` is the one declaration per section. It couples a React
 * component (designed freely in Tailwind) with what the client may change:
 * fields (texts, images, links, lists) and options (layout choices).
 *
 * From this one object the kit derives the manifest, the zod schema, the
 * default content of a fresh block and the props the component receives.
 */

export type InferOptions<O extends Record<string, OptionDescriptor>> = {
  [K in keyof O]: O[K]["choices"][number]["value"]
}

export type BlockComponentProps<
  F extends Record<string, FieldDescriptor> = Record<string, FieldDescriptor>,
  O extends Record<string, OptionDescriptor> = Record<string, OptionDescriptor>,
> = {
  props: InferProps<F>
  options: InferOptions<O>
  block: Block
}

export type BlockDefinition<
  F extends Record<string, FieldDescriptor> = Record<string, FieldDescriptor>,
  O extends Record<string, OptionDescriptor> = Record<string, OptionDescriptor>,
> = {
  type: string
  label: Text
  description: Text
  fields: F
  options: O
  /** Content a fresh block starts with. Missing fields get an empty value. */
  defaults: Partial<InferProps<F>>
  source?: BlockSource
  component: React.ComponentType<BlockComponentProps<F, O>>
}

export function defineBlock<
  const F extends Record<string, FieldDescriptor>,
  const O extends Record<string, OptionDescriptor>,
>(definition: {
  type: string
  label: Text
  description: Text
  fields: F
  options?: O
  defaults?: Partial<InferProps<F>>
  source?: BlockSource
  component: React.ComponentType<BlockComponentProps<F, O>>
}): BlockDefinition<F, O> {
  return {
    ...definition,
    options: (definition.options ?? {}) as O,
    defaults: definition.defaults ?? {},
  }
}

export function option<const V extends string>(
  label: Text,
  choices: { value: V; label: Text }[],
  fallback: NoInfer<V>
): { label: Text; choices: { value: V; label: Text }[]; default: V } {
  return { label, choices, default: fallback }
}

/* ------------------------------------------------------------------ */
/* Registry — all blocks of one site                                   */
/* ------------------------------------------------------------------ */

// The registry holds blocks with different generics; it treats them uniformly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBlockDefinition = BlockDefinition<any, any>

export type Registry = ReturnType<typeof createRegistry>

export function createRegistry(
  site: string,
  definitions: AnyBlockDefinition[],
  extra: {
    theme?: ThemeSpec | null
    content?: ContentType[]
    collections?: CollectionType[]
    targets?: Manifest["targets"]
    starter?: string[]
  } = {}
) {
  const byType = new Map<string, AnyBlockDefinition>()
  for (const definition of definitions) byType.set(definition.type, definition)

  const manifestBlock = (definition: AnyBlockDefinition): ManifestBlock => ({
    type: definition.type,
    label: definition.label,
    description: definition.description,
    fields: definition.fields,
    options: definition.options,
    defaults: {
      props: defaultProps(definition),
      options: defaultOptions(definition),
    },
    source: definition.source,
  })

  const manifest = (): Manifest => ({
    version: 1,
    site,
    blocks: definitions.map(manifestBlock),
    theme: extra.theme === undefined ? THEME_SPEC : extra.theme,
    ...(extra.content ? { content: extra.content } : {}),
    ...(extra.collections ? { collections: extra.collections } : {}),
    ...(extra.targets ? { targets: extra.targets } : {}),
    ...(extra.starter ? { starter: extra.starter } : {}),
  })

  const newBlock = (type: string): Block => {
    const definition = byType.get(type)
    if (!definition) throw new Error(`unknown block type "${type}"`)
    return {
      id: uid("blk"),
      type,
      props: defaultProps(definition),
      options: defaultOptions(definition),
    }
  }

  return {
    site,
    definitions,
    get: (type: string) => byType.get(type),
    /** A collection the site declares (news …), by key. */
    collection: (key: string) => extra.collections?.find((collection) => collection.key === key),
    has: (type: string) => byType.has(type),
    manifest,
    newBlock,
  }
}

function defaultProps(definition: AnyBlockDefinition): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(definition.fields as Record<string, FieldDescriptor>)) {
    const given = (definition.defaults as Record<string, unknown>)[key]
    props[key] = given === undefined ? emptyValue(field) : given
  }
  return props
}

function defaultOptions(definition: AnyBlockDefinition): Record<string, string> {
  const options: Record<string, string> = {}
  for (const [key, opt] of Object.entries(definition.options as Record<string, OptionDescriptor>)) {
    options[key] = opt.default
  }
  return options
}

/* ------------------------------------------------------------------ */
/* Shared content — declared by the site, edited in the CMS            */
/* ------------------------------------------------------------------ */

export function defineContent<const F extends Record<string, ItemFieldDescriptor>>(type: {
  key: string
  label: Text
  description?: Text
  kind: "single" | "list"
  fields: F
  titleField?: keyof F & string
  chrome?: ("header" | "footer")[]
  language?: string
}): ContentType {
  return type
}

/** The value of one content type, filled to its full shape (missing fields get an empty value). */
export function normaliseContent(type: ContentType, value: unknown): unknown {
  const fill = (input: unknown) => {
    const record = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(type.fields)) {
      out[key] = record[key] === undefined ? emptyValue(field) : record[key]
    }
    return out
  }
  if (type.kind === "single") return fill(value)
  const items = Array.isArray(value) ? value : []
  return items.map((item) => ({ id: String((item as ListItem)?.id ?? uid("it")), ...fill(item) }))
}

/** A fresh block from its manifest entry — what the editor and the agent use. */
export function newBlockFromManifest(manifest: ManifestBlock): Block {
  return {
    id: uid("blk"),
    type: manifest.type,
    props: structuredClone(manifest.defaults.props),
    options: { ...manifest.defaults.options },
  }
}

/** Fills missing fields and options so a block always has the full shape. */
export function normaliseBlock(manifest: ManifestBlock, block: Block): Block {
  const props: Record<string, unknown> = { ...manifest.defaults.props }
  for (const key of Object.keys(manifest.fields)) {
    if (block.props?.[key] !== undefined) props[key] = block.props[key]
  }
  const options: Record<string, string> = { ...manifest.defaults.options }
  for (const [key, opt] of Object.entries(manifest.options)) {
    const value = block.options?.[key]
    if (opt.choices.some((choice) => choice.value === value)) options[key] = value
  }
  return { ...block, props, options }
}
