import { NextRequest } from "next/server";
import { POST as CreateDraftPOST } from "@/app/api/control-room/orders/create-draft/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return CreateDraftPOST(request);
}