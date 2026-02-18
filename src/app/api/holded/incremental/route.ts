// src/app/api/holded/incremental/route.ts
/**
 * VIHOLABS — HOLDed Incremental (LEGACY WRAPPER)
 *
 * Canonical incremental ingestion endpoint:
 *   /api/holded/invoices/import-incremental
 *
 * This route exists ONLY for historical callers.
 * It forwards GET/POST to the canonical stateful incremental route.
 */

export const runtime = "nodejs";

import { GET as canonicalGET, POST as canonicalPOST } from "../invoices/import-incremental/route";

export async function GET(req: Request) {
  return canonicalGET(req);
}

export async function POST(req: Request) {
  return canonicalPOST(req);
}
