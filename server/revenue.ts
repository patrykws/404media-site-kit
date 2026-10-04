import "server-only"

import type { RevenuePayment } from "../revenue"
import type { Platform } from "./index"

/**
 * The site half of the "Umsatz" module. A site turns it on with one route and
 * a source — the shared Stripe source, its own (bookings in its CMS), or both:
 *
 *   // src/app/api/editor/revenue/route.ts
 *   export const { GET } = revenueRoute(platform, stripeRevenue())
 *
 * and the editor's site record gets the `umsatz` module (`scripts/site.mjs set <id> --modules umsatz`).
 */

export type RevenueSource = () => Promise<RevenuePayment[]>

export function revenueRoute(platform: Platform, source: RevenueSource) {
  return {
    GET: async (request: Request) => {
      if (!platform.isPlatform(request)) return Response.json({ error: "unauthorized" }, { status: 401 })
      const payments = (await source()).sort((a, b) => b.at.localeCompare(a.at))
      return Response.json({ payments }, { headers: { "cache-control": "no-store" } })
    },
  }
}

/** Several sources as one (e.g. Stripe plus payments entered by hand); a payment id counts once. */
export function combineRevenue(...sources: RevenueSource[]): RevenueSource {
  return async () => {
    const seen = new Set<string>()
    return (await Promise.all(sources.map((source) => source())))
      .flat()
      .filter((payment) => !seen.has(payment.id) && Boolean(seen.add(payment.id)))
  }
}

type StripeCharge = {
  id: string
  amount: number
  amount_refunded: number
  currency: string
  created: number
  status: string
  paid: boolean
  description: string | null
  metadata: Record<string, string>
  billing_details: { name: string | null; email: string | null }
  receipt_email: string | null
}

/**
 * Every successful card payment in the site's Stripe account (EUR, minus
 * refunds), read with the site's own key (`STRIPE_SECRET_KEY`). What it was
 * for comes from the charge's description, or `metadata.title`; a site that
 * sets `metadata.category` on its checkouts gets its own grouping.
 */
export function stripeRevenue(options: { secretKey?: string; since?: Date } = {}): RevenueSource {
  return async () => {
    const key = options.secretKey ?? process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error("stripeRevenue: STRIPE_SECRET_KEY is missing")
    const payments: RevenuePayment[] = []
    let after: string | undefined
    for (let page = 0; page < 100; page++) {
      const query = new URLSearchParams({ limit: "100" })
      if (after) query.set("starting_after", after)
      if (options.since) query.set("created[gte]", String(Math.floor(options.since.getTime() / 1000)))
      const response = await fetch(`https://api.stripe.com/v1/charges?${query}`, {
        headers: { authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`stripeRevenue: Stripe answered ${response.status}`)
      const { data, has_more } = (await response.json()) as { data: StripeCharge[]; has_more: boolean }
      for (const charge of data) {
        const net = charge.amount - charge.amount_refunded
        if (charge.status !== "succeeded" || !charge.paid || charge.currency !== "eur" || net <= 0) continue
        payments.push({
          id: charge.id,
          at: new Date(charge.created * 1000).toISOString(),
          amountEur: net / 100,
          title: charge.metadata.title || charge.description || "Zahlung",
          category: charge.metadata.category || null,
          name: charge.billing_details.name,
          email: charge.billing_details.email ?? charge.receipt_email,
          via: "stripe",
        })
      }
      if (!has_more || data.length === 0) break
      after = data[data.length - 1].id
    }
    return payments
  }
}
