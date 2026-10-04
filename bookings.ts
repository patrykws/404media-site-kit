/**
 * The "Buchungen" module's contract: everything a client handles after a
 * visitor acted — bookings, requests, vouchers, orders — shown and worked
 * through inside the editor, while the site keeps the data, the payment keys
 * and every business rule.
 *
 * The site describes its records as lists of items, and says per item which
 * actions are possible right now (with the fields each one asks for). The
 * editor draws them and sends a chosen action back; it never decides what a
 * status means or what an action does. Labels come from the site, in the
 * client's language.
 *
 *   GET  /api/editor/bookings            → BookingsAnswer
 *   POST /api/editor/bookings            ← BookingActionCall → BookingActionResult
 *
 * Both with the site's shared secret. Server half:
 * `@404media/site-kit/server/bookings` (`bookingsRoute(platform, source)`).
 */

/** How a status reads at a glance — the editor picks the colour, the site the word. */
export type BookingTone = "attention" | "waiting" | "ok" | "done" | "off"

export type BookingStatus = {
  label: string
  tone: BookingTone
}

/** A value the site asks for before an action runs. */
export type BookingInput = {
  name: string
  label: string
  type: "text" | "textarea" | "email" | "tel" | "number" | "money" | "date" | "datetime" | "select" | "checkbox"
  required?: boolean
  /** Pre-filled value (money: euros as a number; datetime: ISO). */
  value?: string | number | boolean | null
  /** For `select`. */
  options?: { value: string; label: string }[]
  hint?: string
  min?: number
  max?: number
}

export type BookingAction = {
  /** Sent back as `action`. */
  id: string
  label: string
  /** `primary`: the one next step; `danger`: gives a seat back, refunds, cancels. */
  tone?: "primary" | "default" | "danger"
  /** Asked before it runs (every `danger` action has one). */
  confirm?: { title: string; text: string; button: string }
  /** Fields shown in a small form before it runs. */
  inputs?: BookingInput[]
}

/** One line of detail ("E-Mail", "Telefon", "Nachricht" …). */
export type BookingDetail = {
  label: string
  value: string
  /** How the editor shows it: a mail/phone/web link, a link to copy, or a long text. */
  kind?: "text" | "long" | "email" | "tel" | "url" | "copy"
}

export type BookingItem = {
  id: string
  /** Who — usually the person's name. */
  title: string
  /** What — course and date, the service, "Gutschein über 50 €". */
  subtitle?: string
  status: BookingStatus
  /** Euros; for an unpaid item what is owed. */
  amountEur?: number | null
  /** Places, pieces … shown as "× n" when above 1. */
  quantity?: number | null
  /** ISO date-time the item sorts and filters by (booked at, requested at …). */
  at?: string | null
  /** The `key` of its group in the list, if the list has groups. */
  group?: string | null
  details: BookingDetail[]
  actions: BookingAction[]
  /** Searchable extra words (code, e-mail …) beyond title and subtitle. */
  search?: string
}

/** A group of items — a course date with its guests. */
export type BookingGroup = {
  key: string
  title: string
  /** "Sa 12. Okt · 18:00" */
  subtitle?: string
  /** ISO start, for sorting and the upcoming/past split. */
  at?: string | null
  /** "7 von 12 Plätzen" */
  meta?: string
  status?: BookingStatus
  actions: BookingAction[]
}

export type BookingList = {
  key: string
  title: string
  /** One plain sentence: what this list is for. */
  intro?: string
  /** Shown when nothing is in it. */
  empty?: string
  groups?: BookingGroup[]
  items: BookingItem[]
  /** Actions on the list itself ("Gutschein anlegen"). */
  actions: BookingAction[]
}

/** What waits for the client — shown on top, each one opens its list. */
export type BookingTodo = {
  label: string
  count: number
  list: string
  tone: BookingTone
}

export type BookingsAnswer = {
  lists: BookingList[]
  todos: BookingTodo[]
}

export type BookingActionCall = {
  list: string
  /** "item" | "group" | "list" — what `id` names. */
  target: "item" | "group" | "list"
  /** The item's or group's id; the list's key for list actions. */
  id: string
  action: string
  values: Record<string, string | number | boolean | null>
}

export type BookingActionResult =
  | {
      ok: true
      /** "Als bezahlt markiert." */
      message: string
      /** A link the client should copy or send (a payment link). */
      link?: string
    }
  | { ok: false; error: string }
