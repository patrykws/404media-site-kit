import type { FieldDescriptor } from "./types"

/**
 * Formatted text (`f.richText`, article bodies) is HTML — and HTML that a
 * site puts into its page with `dangerouslySetInnerHTML`. This allowlist
 * sanitiser is the one gate: the platform runs it on every save and publish,
 * sites run it again when they render (so content that arrived another way —
 * a seed, an old file — is safe too).
 *
 * It never filters the input. It rebuilds the output from what it
 * recognises: allowed tags with allowed attributes; everything else is text
 * and escaped. Scripts, styles and embeds disappear with their content;
 * links and images only keep web, mail, phone and relative addresses.
 * No DOM needed — the same code runs on the server and in the browser.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "sub", "sup", "span", "a",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "code", "pre",
  "img", "figure", "figcaption", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
])

const VOID_TAGS = new Set(["br", "hr", "img"])

/** Removed together with everything inside them. */
const DROPPED_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template", "textarea", "title", "svg", "math", "xmp", "noembed", "noframes", "select"]

const COMMON_ATTRIBUTES = new Set(["class", "title"])
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  ol: new Set(["start"]),
}
const URL_ATTRIBUTES = new Set(["href", "src"])
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"])

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", colon: ":", tab: "\t", newline: "\n" }

function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

const escapeText = (text: string) =>
  text
    /* A "&" that does not start a well-formed entity is escaped; entities stay as written. */
    .replace(/&(?!(?:#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** An address a link or image may use: web, mail, phone, or relative. Null otherwise. */
export function safeUrl(raw: string): string | null {
  const value = decodeEntities(raw).trim()
  /* Browsers ignore whitespace and control characters inside a scheme ("java\nscript:"). */
  const compact = value.replace(/[\u0000- \u007f-\u009f]/g, "").toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)
  if (scheme && !SAFE_SCHEMES.has(scheme[1])) return null
  return value
}

const ATTRIBUTE_PATTERN = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function cleanAttributes(tag: string, source: string) {
  const allowed = TAG_ATTRIBUTES[tag]
  const out: string[] = []
  let blank = false
  for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase()
    if (!COMMON_ATTRIBUTES.has(name) && !allowed?.has(name)) continue
    let value = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "")
    if (URL_ATTRIBUTES.has(name)) {
      const url = safeUrl(value)
      if (url === null) continue
      value = url
    }
    if (name === "target") {
      if (value !== "_blank") continue
      blank = true
    }
    if (name === "rel") continue
    if ((name === "width" || name === "height" || name === "colspan" || name === "rowspan" || name === "start") && !/^\d{1,5}$/.test(value)) continue
    out.push(`${name}="${escapeAttribute(value)}"`)
  }
  if (tag === "a" && blank) out.push('rel="noopener noreferrer"')
  return out.length ? ` ${out.join(" ")}` : ""
}

const TAG_PATTERN = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>?|<\?[^>]*>?|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?\s*>/g

/** HTML with only the allowed tags and attributes left; everything else escaped or gone. */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== "string" || input === "") return ""
  let html = input
  for (const tag of DROPPED_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(?:<\\/${tag}\\s*>|$)`, "gi"), "")
  }
  let out = ""
  let last = 0
  for (const match of html.matchAll(TAG_PATTERN)) {
    out += escapeText(html.slice(last, match.index))
    last = match.index + match[0].length
    const [, closing, rawName, attributes] = match
    if (!rawName) continue // comment, doctype, processing instruction
    const tag = rawName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) continue
    if (closing) {
      if (!VOID_TAGS.has(tag)) out += `</${tag}>`
      continue
    }
    out += `<${tag}${cleanAttributes(tag, attributes ?? "")}>`
  }
  out += escapeText(html.slice(last))
  return out
}

/**
 * The same values with every `richText` field (in lists too) sanitised —
 * what the platform stores. Other fields are left exactly as they are.
 */
export function sanitizeFields<T extends Record<string, unknown>>(fields: Record<string, FieldDescriptor>, values: T): T {
  if (!values || typeof values !== "object") return values
  const out: Record<string, unknown> = { ...values }
  for (const [key, field] of Object.entries(fields)) {
    const value = out[key]
    if (field.kind === "richText" && typeof value === "string") out[key] = sanitizeHtml(value)
    if (field.kind === "file" && value && typeof value === "object") {
      const file = value as { url?: unknown }
      out[key] = { ...value, url: typeof file.url === "string" ? (safeUrl(file.url) ?? "") : "" }
    }
    if (field.kind === "list" && Array.isArray(value)) {
      out[key] = value.map((item) =>
        item && typeof item === "object" ? sanitizeFields(field.item, item as Record<string, unknown>) : item
      )
    }
  }
  return out as T
}
