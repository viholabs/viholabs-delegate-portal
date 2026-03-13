import { NextRequest } from "next/server";
import { POST as canonicalPOST } from "../import-incremental/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return canonicalPOST(request);
}