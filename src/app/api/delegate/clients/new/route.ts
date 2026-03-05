// src/app/api/delegate/clients/new/route.ts
/**
 * Back-compat route.
 * This endpoint is a thin re-export of /api/delegate/clients.
 *
 * IMPORTANT:
 * - ../route DOES NOT export POST (only GET).
 * - Exporting POST here breaks build (TS2305).
 */

export { GET } from "../route";