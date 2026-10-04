import type {
  FieldDescriptor,
  FileValue,
  ItemFieldDescriptor,
  LinkValue,
  ListItem,
  Text,
} from "./types"

/**
 * The field vocabulary a block can use. Each helper returns a plain
 * descriptor — the manifest is these objects, serialised — and the kit
 * derives the validation schema, the panel form and the agent's tool from it.
 */

type TextOpts = { placeholder?: string; optional?: boolean; upload?: "video"; pick?: "link" }
type LongTextOpts = { rows?: number; optional?: boolean }
type LinkOpts = { optional?: boolean; description?: Text }
type RichTextOpts = { optional?: boolean }
type DateOpts = { optional?: boolean }
type SelectOpts = { optional?: boolean }
type ReferenceOpts = { optional?: boolean }
type ReferencesOpts = { max?: number }
type FileOpts = { accept?: string[]; optional?: boolean }
type NumberOpts = { step?: number; min?: number; max?: number; optional?: boolean }
type ListOpts<I extends Record<string, ItemFieldDescriptor>> = {
  item: I
  min?: number
  max?: number
  addLabel: Text
}

export const f = {
  text: (label: Text, opts: TextOpts = {}) =>
    ({ kind: "text", label, ...opts }) as const satisfies FieldDescriptor,
  longText: (label: Text, opts: LongTextOpts = {}) =>
    ({ kind: "longText", label, ...opts }) as const satisfies FieldDescriptor,
  image: (label: Text, opts: { description?: Text } = {}) => ({ kind: "image", label, ...opts }) as const satisfies FieldDescriptor,
  link: (label: Text, opts: LinkOpts = {}) =>
    ({ kind: "link", label, ...opts }) as const satisfies FieldDescriptor,
  boolean: (label: Text, description?: Text) =>
    ({ kind: "boolean", label, description }) as const satisfies FieldDescriptor,
  number: (label: Text, opts: NumberOpts = {}) =>
    ({ kind: "number", label, ...opts }) as const satisfies FieldDescriptor,
  richText: (label: Text, opts: RichTextOpts = {}) =>
    ({ kind: "richText", label, ...opts }) as const satisfies FieldDescriptor,
  date: (label: Text, opts: DateOpts = {}) =>
    ({ kind: "date", label, ...opts }) as const satisfies FieldDescriptor,
  select: (label: Text, choices: { value: string; label: Text }[], opts: SelectOpts = {}) =>
    ({ kind: "select", label, choices, ...opts }) as const satisfies FieldDescriptor,
  /** One entry of another collection, by id — `referenced()` turns it back into the entry. */
  reference: (label: Text, collection: string, opts: ReferenceOpts = {}) =>
    ({ kind: "reference", label, collection, ...opts }) as const satisfies FieldDescriptor,
  /** Several entries of another collection, in the client's order. */
  references: (label: Text, collection: string, opts: ReferencesOpts = {}) =>
    ({ kind: "references", label, collection, max: opts.max ?? 200 }) as const satisfies FieldDescriptor,
  /** An uploaded file — PDFs unless `accept` says otherwise. */
  file: (label: Text, opts: FileOpts = {}) =>
    ({ kind: "file", label, accept: opts.accept ?? ["application/pdf"], ...(opts.optional ? { optional: true } : {}) }) as const satisfies FieldDescriptor,
  list: <I extends Record<string, ItemFieldDescriptor>>(label: Text, opts: ListOpts<I>) =>
    ({
      kind: "list",
      label,
      item: opts.item,
      min: opts.min ?? 0,
      max: opts.max ?? 12,
      addLabel: opts.addLabel,
    }) as const satisfies FieldDescriptor,
}

/* ------------------------------------------------------------------ */
/* Types inferred from descriptors                                     */
/* ------------------------------------------------------------------ */

export type FieldValue<D> = D extends { kind: "text" | "longText" | "image" | "richText" | "date" | "select" | "reference" }
  ? string
  : D extends { kind: "references" }
    ? string[]
  : D extends { kind: "file" }
    ? FileValue
  : D extends { kind: "link" }
    ? LinkValue
    : D extends { kind: "boolean" }
      ? boolean
      : D extends { kind: "number" }
        ? number
      : D extends { kind: "list"; item: infer I }
        ? Array<{ id: string } & { [K in keyof I]: FieldValue<I[K]> }>
        : never

export type InferProps<F extends Record<string, FieldDescriptor>> = {
  [K in keyof F]: FieldValue<F[K]>
}

/** An empty value of the right shape — used when a field is missing. */
export function emptyValue(field: FieldDescriptor): unknown {
  switch (field.kind) {
    case "text":
    case "longText":
    case "image":
    case "richText":
    case "date":
    case "select":
    case "reference":
      return ""
    case "references":
      return []
    case "file":
      return { url: "", name: "", size: 0 }
    case "link":
      return { label: "", target: "" }
    case "boolean":
      return false
    case "number":
      return 0
    case "list":
      return []
  }
}

let seed = Date.now() % 100000
export const uid = (prefix: string) => `${prefix}_${(seed++).toString(36)}`

export function emptyListItem(field: Extract<FieldDescriptor, { kind: "list" }>): ListItem {
  const item: ListItem = { id: uid("it") }
  for (const [key, sub] of Object.entries(field.item)) item[key] = emptyValue(sub)
  return item
}

/* ------------------------------------------------------------------ */
/* Paths — "items.0.quote" — the way inline edits address a value.     */
/* ------------------------------------------------------------------ */

export function getPath(props: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") return undefined
    return (value as Record<string, unknown>)[key]
  }, props)
}

/** Returns a new props object with the value at `path` replaced. */
export function setPath(
  props: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const keys = path.split(".")
  const walk = (node: unknown, index: number): unknown => {
    const key = keys[index]
    if (index === keys.length - 1) {
      if (Array.isArray(node)) {
        const copy = [...node]
        copy[Number(key)] = value
        return copy
      }
      return { ...(node as Record<string, unknown>), [key]: value }
    }
    if (Array.isArray(node)) {
      const copy = [...node]
      copy[Number(key)] = walk(node[Number(key)], index + 1)
      return copy
    }
    const record = (node ?? {}) as Record<string, unknown>
    return { ...record, [key]: walk(record[key], index + 1) }
  }
  return walk(props, 0) as Record<string, unknown>
}
