/**
 * Aqtelo site kit — the contract between a client site and the platform.
 *
 * Everything in `src/site-kit` is meant to be lifted into the site starter
 * as a package: it imports nothing from the app. The app only ever sees the
 * *manifest* a site publishes (which blocks exist, which fields they have)
 * and the JSON of a page; the site holds the components.
 */

export type Text = { de: string; en: string }

/** Who last touched something. The platform defines the actual ids. */
export type Author = string

/** One section of a page: which block, what is in it, how it is laid out. */
export type Block = {
  id: string
  type: string
  /** The fields (texts, images, links, lists) — shape from the block's manifest. */
  props: Record<string, unknown>
  /** Layout choices — every value is one of the choices the block declares. */
  options: Record<string, string>
  /** Hidden blocks stay on the page but visitors don't see them. */
  hidden?: boolean
  /** The agent may not touch a locked block. */
  locked?: boolean
  changedBy?: Author
  /** ISO date. */
  changedAt?: string
  /** Why the agent changed it (only when changedBy === "agent"). */
  agentReason?: Text
}

export type PageStatus = "veroeffentlicht" | "entwurf"

export type Page = {
  slug: string
  title: string
  /** Public path on the client's domain, "/" for the start page. */
  path: string
  inMenu: boolean
  status: PageStatus
  createdBy: Author
  changedBy: Author
  /** ISO date. */
  changedAt: string
  blocks: Block[]
  /** Search engines: title, description, and whether to keep the page out of them. */
  seo?: PageSeo
  /** Language of the page ("en", "de") on a site in more than one; unset = from the address. */
  lang?: string
  /** The same page in the site's other languages: language → page slug. */
  translations?: Record<string, string>
}

export type PageSeo = { title?: string; description?: string; noindex?: boolean }

/** The value of an `f.file` field. `url` is absolute or a path on the site ("/media/…pdf"). */
export type FileValue = { url: string; name: string; size: number }

/** A link inside the site: a page slug, "tel" or "mail". */
export type LinkValue = { label: string; target: string }

export type ListItem = { id: string } & Record<string, unknown>

export type MenuEntry = { slug: string; title: string; path: string }

export type SiteImage = {
  id: string
  /** Plain file name, the way it is shown to the client. */
  label: string
  url: string
  alt?: string
}

/** Business details the fixed parts of the site (header, footer, contact) use. */
export type SiteInfo = {
  name: string
  short: string
  tagline: string
  street: string
  city: string
  phone: string
  email: string
  hours: string[]
  legal: { label: string; path: string }[]
}

/** An entry of a content collection, flattened for the blocks that list them. */
export type CollectionItem = {
  id: string
  title: string
  text?: string
  image?: string
  role?: string
  question?: string
  answer?: string
}

/** Everything a page needs besides its own blocks. */
export type SiteData = {
  info: SiteInfo
  menu: MenuEntry[]
  images: SiteImage[]
  collections: Record<string, CollectionItem[]>
  /**
   * The site's own shared content (`Manifest.content`): one value per key —
   * the fields of a single entry, or the items of a list. Drafts in the editor,
   * published values on the live site.
   */
  content?: Record<string, unknown>
  /** Where the site is mounted ("" on its own domain, "/site" inside the app). */
  basePath: string
  /**
   * The entries of the site's collections (`Manifest.collections`), one list
   * per collection key, newest first. Drafts in the editor, published on the
   * live site.
   */
  entries?: Record<string, Entry[]>
}

/* ------------------------------------------------------------------ */
/* Fields and options — what a block lets the client change.           */
/* ------------------------------------------------------------------ */

export type FieldDescriptor =
  /** `upload: "video"`: an address the panel also fills by uploading a video (mp4, webm). `pick: "link"`: a page or address, chosen like a button's target. */
  | { kind: "text"; label: Text; placeholder?: string; optional?: boolean; upload?: "video"; pick?: "link" }
  | { kind: "longText"; label: Text; rows?: number; optional?: boolean }
  | { kind: "image"; label: Text; description?: Text }
  | { kind: "link"; label: Text; optional?: boolean; description?: Text }
  | { kind: "boolean"; label: Text; description?: Text }
  /** A number — prices, counts, coordinates. */
  | { kind: "number"; label: Text; step?: number; min?: number; max?: number; optional?: boolean }
  /** Formatted text (headings, lists, links) — stored as sanitised HTML (`sanitizeHtml`, on every save and publish). */
  | { kind: "richText"; label: Text; optional?: boolean }
  /** A calendar day, stored as "YYYY-MM-DD" ("" when optional and empty). */
  | { kind: "date"; label: Text; optional?: boolean }
  /** One value from a fixed list the site declares (a category, a topic, a location); "" when optional and empty. */
  | { kind: "select"; label: Text; choices: { value: string; label: Text }[]; optional?: boolean }
  /** One entry of a collection (a product's group), stored as the entry's id; "" when optional and empty. */
  | { kind: "reference"; label: Text; collection: string; optional?: boolean }
  /** Several entries of a collection, in the order given (a group's products), stored as entry ids. */
  | { kind: "references"; label: Text; collection: string; max: number }
  /** An uploaded file (a PDF data sheet): its address, file name and size in bytes. */
  | { kind: "file"; label: Text; accept: string[]; optional?: boolean }
  | {
      kind: "list"
      label: Text
      item: Record<string, FieldDescriptor>
      min: number
      max: number
      addLabel: Text
    }

/** What a list item and a content type may hold — any field, a list included. */
export type ItemFieldDescriptor = FieldDescriptor

export type OptionDescriptor = {
  label: Text
  choices: { value: string; label: Text }[]
  default: string
}

/** Where an automatic block gets its items from (services, team, …). */
export type BlockSource = { collection: string; label: Text }

export type ManifestBlock = {
  type: string
  label: Text
  description: Text
  fields: Record<string, FieldDescriptor>
  options: Record<string, OptionDescriptor>
  defaults: { props: Record<string, unknown>; options: Record<string, string> }
  source?: BlockSource
}

/**
 * Shared content the site declares besides its pages — site settings, prices,
 * team members: edited in the CMS, used by any block via `site.content[key]`.
 * `single` is one set of fields, `list` a list of entries with those fields.
 */
export type ContentType = {
  key: string
  label: Text
  description?: Text
  kind: "single" | "list"
  fields: Record<string, ItemFieldDescriptor>
  /** list: the field that names an entry in the CMS list. */
  titleField?: string
  /** Selecting the header or footer in the editor opens this content's fields. */
  chrome?: ("header" | "footer")[]
  /** With chrome: the page language it belongs to ("de", "en") — a German page's header opens the German menu. */
  language?: string
  /** single: the CMS shows the fields in these sections, in this order (`defineContent({ sections })`). */
  groups?: ContentGroup[]
  /** A form of the site (`defineForm`): listed under "Formulare", its pop-up previewed in every state. */
  form?: FormInfo
}

export type ContentGroup = { title: Text; fields: string[] }

export type FormInfo = {
  /** Where the enquiries go — shown read-only; only 404media changes it (the site's code or env). */
  recipient?: string
}

/* ------------------------------------------------------------------ */
/* Collections — entries with a page of their own (news, later jobs …)  */
/* ------------------------------------------------------------------ */

/** One entry of a collection: its address and the fields the collection declares. */
export type Entry = {
  id: string
  /** Last part of its public path: `<collection.path>/<slug>`. */
  slug: string
  fields: Record<string, unknown>
  /** Google title and description and the picture a shared link shows; empty = taken from the fields. */
  seo?: EntrySeo
}

/** `image`: an image id from the library (or an address). */
export type EntrySeo = { title?: string; description?: string; image?: string }

/**
 * A collection the site declares: entries that each get a detail page
 * (news today; insights, events, jobs, products later). Each entry has its
 * own draft and its own "publish". The fields use the block vocabulary.
 */
export type CollectionType = {
  key: string
  /** The collection's name ("News"). */
  label: Text
  /** One entry's name ("Beitrag"). */
  itemLabel: Text
  description?: Text
  fields: Record<string, ItemFieldDescriptor>
  /** The field that names an entry (and its slug to begin with). */
  titleField: string
  /** The field entries are sorted by, newest first. */
  dateField?: string
  /** A number field that sets the order (lowest first) — before the date. For lists the client arranges (downloads). */
  orderField?: string
  /** Further fields the CMS list shows as columns (a product's group, a download's category). */
  columns?: string[]
  /** Public path prefix of the detail pages ("/news" → "/news/<slug>"; "/" → "/<slug>"). */
  path: string
  /** The page that lists the entries — the menu entry a detail page belongs to. */
  listPage?: string
}

/** An entry together with the collection it belongs to — what a detail page renders. */
export type EntryRef = { collection: string; entry: Entry }

export type Manifest = {
  version: 1
  site: string
  blocks: ManifestBlock[]
  /** null: the design is fixed in code — the editor offers no design panel. */
  theme: ThemeSpec | null
  content?: ContentType[]
  /** Collections with detail pages (news …). */
  collections?: CollectionType[]
  /** Extra things a button may lead to besides pages, phone and e-mail (a booking form, an enquiry dialog). */
  targets?: { value: string; label: Text }[]
  /** The blocks a new page starts with; the first one's `title` gets the page name. */
  starter?: string[]
}

/* ------------------------------------------------------------------ */
/* Theme — the site-wide design the client may adjust.                 */
/* ------------------------------------------------------------------ */

export type ThemeColors = {
  /** Brand colour: buttons, links, accents. */
  primary: string
  /** Body text. */
  ink: string
  /** Page background. */
  surface: string
  /** Tinted background for alternating sections. */
  surfaceAlt: string
  /** Background of dark sections (calls to action). */
  dark: string
}

export type Theme = {
  colors: ThemeColors
  /** Whether text on the brand colour is light or dark. */
  onPrimary: "hell" | "dunkel"
  fonts: { heading: string; body: string }
  /** Base size in px and the ratio between steps. */
  scale: { base: number; ratio: number }
  spacing: "kompakt" | "normal" | "luftig"
  /** Corner radius in px. */
  radius: number
  buttons: "eckig" | "rund"
}

export type FontChoice = {
  /** Family name, as stored in the theme. */
  name: string
  /** Google Fonts family spec, e.g. "Fraunces:opsz,wght@9..144,400..700". */
  google: string
  /** CSS fallback stack. */
  fallback: string
  kind: "sans" | "serif"
}

/** What the design panel may offer — part of the manifest. */
export type ThemeSpec = {
  colors: { key: keyof ThemeColors; label: Text }[]
  fonts: FontChoice[]
  scale: { bases: number[]; ratios: { value: number; label: Text }[] }
  radii: number[]
}
