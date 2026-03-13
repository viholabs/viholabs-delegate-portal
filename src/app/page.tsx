/**
 * AUDIT TRACE
 * Date: 2026-03-09
 * Actor: CHATGPT
 * Reason: Canonical root entry redirect
 * Scope: Root routing only. No UI/business logic changes.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const CANONICAL_LOGGED_ENTRY = "/control-room/shell?tab=situation";
const CANONICAL_LOGIN_ENTRY = "/login";

export default async function HomePage() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(CANONICAL_LOGIN_ENTRY);
    }

    redirect(CANONICAL_LOGGED_ENTRY);
  } catch {
    redirect(CANONICAL_LOGIN_ENTRY);
  }
}