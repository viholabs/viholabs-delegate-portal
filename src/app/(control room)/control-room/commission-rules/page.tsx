// src/app/(control room)/control-room/commission-rules/page.tsx
/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Reason: Canonical Single Page enforcement — all Control Room sections redirect to /control-room/shell?tab=commission-rules
 * Scope: Routing only. No UI/content changes here.
 */
import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default function Page() {
  redirect("/control-room/shell?tab=commission-rules");
}
