// src/app/(control room)/control-room/orders/new/page.tsx
/**
 * AUDIT TRACE
 * Date: 2026-02-16
 * Reason: Canonical Single Page enforcement — all Control Room sections redirect to /control-room/shell?tab=orders.new
 * Scope: Routing only. No UI/content changes here.
 */
import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default function Page() {
  redirect("/control-room/shell?tab=orders.new");
}
