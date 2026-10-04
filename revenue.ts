/**
 * The "Umsatz" module's contract: what a site's `GET /api/editor/revenue`
 * answers (`{ payments: RevenuePayment[] }`) and the editor's Umsatz screen
 * adds up. The site keeps the payment keys and the customer data; the editor
 * only reads this list, with the shared secret. Server half:
 * `@404media/site-kit/server/revenue`.
 */
export type RevenuePayment = {
  id: string
  /** ISO date-time the money came in. */
  at: string
  amountEur: number
  /** What was paid for: the course, the product, "Gutschein" … */
  title: string
  /** The site's own grouping, in the client's words ("Kurs & Workshop", "Gutschein"); null: none. */
  category: string | null
  /** Who paid. */
  name: string | null
  email: string | null
  /** "stripe" (card through Stripe), "manuell" (cash / transfer entered by hand) or another source's name. */
  via: string
}
