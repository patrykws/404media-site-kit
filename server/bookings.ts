import "server-only"

import type { BookingActionCall, BookingActionResult, BookingsAnswer } from "../bookings"
import type { Platform } from "./index"

/**
 * The site half of the "Buchungen" module. The site brings its own source —
 * where its bookings live and what each action does:
 *
 *   // src/app/api/editor/bookings/route.ts
 *   export const { GET, POST } = bookingsRoute(platform, { read, act })
 *
 * and the editor's site record gets the `buchungen` module
 * (`scripts/site.mjs set <id> --modules buchungen`).
 */
export type BookingsSource = {
  read: () => Promise<BookingsAnswer>
  /** Runs one action. Throwing answers a generic error; a refusal the client should read is `{ ok: false, error }`. */
  act: (call: BookingActionCall) => Promise<BookingActionResult>
}

const VALUE = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value)

function parseCall(body: unknown): BookingActionCall | null {
  if (!body || typeof body !== "object") return null
  const { list, target, id, action, values } = body as Record<string, unknown>
  if (typeof list !== "string" || typeof id !== "string" || typeof action !== "string") return null
  if (target !== "item" && target !== "group" && target !== "list") return null
  const given = values && typeof values === "object" ? (values as Record<string, unknown>) : {}
  if (!Object.values(given).every(VALUE)) return null
  return { list, target, id, action, values: given as BookingActionCall["values"] }
}

export function bookingsRoute(platform: Platform, source: BookingsSource) {
  const headers = { "cache-control": "no-store" }
  return {
    GET: async (request: Request) => {
      if (!platform.isPlatform(request)) return Response.json({ error: "unauthorized" }, { status: 401 })
      return Response.json(await source.read(), { headers })
    },
    POST: async (request: Request) => {
      if (!platform.isPlatform(request)) return Response.json({ error: "unauthorized" }, { status: 401 })
      const call = parseCall(await request.json().catch(() => null))
      if (!call) return Response.json({ ok: false, error: "Ungültige Anfrage." }, { status: 400, headers })
      try {
        return Response.json(await source.act(call), { headers })
      } catch (error) {
        console.error("bookings action failed", call.list, call.action, error)
        return Response.json({ ok: false, error: "Das hat nicht geklappt. Bitte noch einmal versuchen." }, { status: 500, headers })
      }
    },
  }
}
