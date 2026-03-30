import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WarningCreateBody = {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  client_id?: string | null;
  delegate_id?: string | null;
  holded_contact_id?: string | null;
  recipients?: string[];
  context?: Record<string, unknown> | null;
};

function safeStr(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeSeverity(value: unknown): "info" | "warning" | "critical" {
  if (value === "info" || value === "warning" || value === "critical") {
    return value;
  }
  return "warning";
}

function safeRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safeStr(item))
    .filter(Boolean);
}

function safeContext(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null);

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid warning payload",
        },
        { status: 400 }
      );
    }

    const body = raw as Record<string, unknown>;

    const payload: WarningCreateBody = {
      code: safeStr(body.code),
      severity: safeSeverity(body.severity),
      title: safeStr(body.title),
      message: safeStr(body.message),
      client_id: safeStr(body.client_id) || null,
      delegate_id: safeStr(body.delegate_id) || null,
      holded_contact_id: safeStr(body.holded_contact_id) || null,
      recipients: safeRecipients(body.recipients),
      context: safeContext(body.context),
    };

    if (!payload.code) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing warning code",
        },
        { status: 400 }
      );
    }

    if (!payload.title) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing warning title",
        },
        { status: 400 }
      );
    }

    if (!payload.message) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing warning message",
        },
        { status: 400 }
      );
    }

    const warningEvent = {
      emitted_at: new Date().toISOString(),
      system: "VIHOLABS G1",
      type: "CONTROL_ROOM_WARNING",
      payload,
    };

    console.warn("VIHOLABS_WARNING_EVENT", JSON.stringify(warningEvent));

    return NextResponse.json(
      {
        ok: true,
        data: {
          accepted: true,
          persisted: false,
          transport: "server-log",
          warning: warningEvent,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}