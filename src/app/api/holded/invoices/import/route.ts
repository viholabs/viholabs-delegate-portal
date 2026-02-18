// src/app/api/holded/invoices/import/route.ts
/**
 * VIHOLABS — HOLDed Import (LEGACY WRAPPER)
 *
 * Canonical incremental ingestion endpoint:
 *   /api/holded/invoices/import-incremental
 *
 * This route exists ONLY for backward compatibility.
 * It forwards GET/POST to the canonical stateful incremental route.
 *
 * IMPORTANT:
 * import-incremental is a SIBLING folder, not child.
 */

export const runtime = "nodejs";

import {
  GET as canonicalGET,
  POST as canonicalPOST,
} from "../import-incremental/route";

export async function GET(req: Request) {
  return canonicalGET(req);
}

export async function POST(req: Request) {
  return canonicalPOST(req);
}
