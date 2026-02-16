//src/components/control-room/technical/blocks/Z2PipelinesLive.tsx <<'EOF'
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Z2Pipelines, {
  type Z2PipelineError,
  type Z2PipelineRow,
  type Z2PipelineStatus,
  type Z2PipelinesModel,
} from "./Z2Pipelines";
import Z2_1HoldedInvoicesThisMonth from "./Z2_1HoldedInvoicesThisMonth";

type SubsystemKey = "holded" | "shopify" | "bixgrow" | "commissions";
type LogSeverity = "INFO" | "WARN" | "CRITICAL";

type LogItem = {
  at: string;
  message: string;
  severity: LogSeverity;
};

type LogsLatestResponse = {
  ok: boolean;
  logs?: Record<SubsystemKey, LogItem[]>;
};

function statusFromPing(ok: boolean, httpStatus?: number | null): Z2PipelineStatus {
  if (ok) return "OK";
  if (httpStatus && httpStatus >= 400 && httpStatus < 500) return "DEGRADED";
  if (httpStatus && httpStatus >= 500) return "CRITICAL";
  return "UNKNOWN";
}

function statusFromLogs(base: Z2PipelineStatus, logs?: LogItem[]): Z2PipelineStatus {
  const arr = Array.isArray(logs) ? logs : [];
  if (arr.some((e) => e.severity === "CRITICAL")) return "CRITICAL";
  if (arr.some((e) => e.severity === "WARN")) return base === "CRITICAL" ? "CRITICAL" : "DEGRADED";
  return base; // pot ser UNKNOWN
}

function classifyError(message: string): Z2PipelineError["type"] {
  const s = String(message || "").toLowerCase();
  if (s.includes("auth") || s.includes("unauth") || s.includes("no autorizado") || s.includes("no autenticado")) return "auth";
  if (s.includes("schema") || s.includes("column") || s.includes("relation") || s.includes("does not exist")) return "schema";
  if (s.includes("mapping") || s.includes("normalize") || s.includes("parse")) return "mapping";
  return "runtime";
}

function errorsFromLogs(logs?: LogItem[]): Z2PipelineError[] {
  const arr = Array.isArray(logs) ? logs : [];
  return arr
    .filter((e) => e.severity === "WARN" || e.severity === "CRITICAL")
    .map((e) => ({
      type: classifyError(e.message),
      message: e.message,
    }));
}

export default function Z2PipelinesLive() {
  const [logsBy, setLogsBy] = useState<Record<SubsystemKey, LogItem[]>>({
    holded: [],
    shopify: [],
    bixgrow: [],
    commissions: [],
  });

  const [holdedPing, setHoldedPing] = useState<{ ok: boolean; status: number | null; count: number | null }>({
    ok: false,
    status: null,
    count: null,
  });

  const [shopifyPing, setShopifyPing] = useState<{ ok: boolean; status: number | null }>({
    ok: false,
    status: null,
  });

  const lastOkRef = useRef<{ model: Z2PipelinesModel | null }>({ model: null });

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        // 1) Logs latest (font canònica de senyal funcional)
        const logsRes = await fetch("/api/control-room/tech/logs/latest", {
          credentials: "include",
          headers: { accept: "application/json" },
        });

        const logsData = (await logsRes.json().catch(() => null)) as LogsLatestResponse | null;

        if (alive && logsRes.ok && logsData?.ok && logsData.logs) {
          setLogsBy({
            holded: Array.isArray(logsData.logs.holded) ? logsData.logs.holded : [],
            shopify: Array.isArray(logsData.logs.shopify) ? logsData.logs.shopify : [],
            bixgrow: Array.isArray(logsData.logs.bixgrow) ? logsData.logs.bixgrow : [],
            commissions: Array.isArray(logsData.logs.commissions) ? logsData.logs.commissions : [],
          });
        }

        // 2) Holded ping
        const hp = await fetch("/api/holded/ping", { credentials: "include" });
        const hpJson = await hp.json().catch(() => null);

        if (alive) {
          setHoldedPing({
            ok: Boolean(hp.ok && hpJson?.ok),
            status: hp.status,
            count: typeof hpJson?.holded?.count === "number" ? hpJson.holded.count : null,
          });
        }

        // 3) Shopify ping
        const sp = await fetch("/api/shopify/ping", { credentials: "include" });
        const spJson = await sp.json().catch(() => null);

        if (alive) {
          setShopifyPing({
            ok: Boolean(sp.ok && spJson?.ok),
            status: sp.status,
          });
        }
      } catch {
        // silenci canònic (sense stacktraces)
      }
    }

    tick();
    const id = setInterval(tick, 20000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const model = useMemo<Z2PipelinesModel>(() => {
    const holdedBase = statusFromPing(holdedPing.ok, holdedPing.status);
    const shopifyBase = statusFromPing(shopifyPing.ok, shopifyPing.status);

    // REALITAT: si no hi ha ping dedicat, la base és UNKNOWN (no inventem degradació).
    const bixgrowBase: Z2PipelineStatus = "UNKNOWN";
    const commissionsBase: Z2PipelineStatus = "UNKNOWN";

    const rows: Z2PipelineRow[] = [
      {
        key: "holded",
        label: "Holded",
        status: statusFromLogs(holdedBase, logsBy.holded),
        records_affected: typeof holdedPing.count === "number" ? String(holdedPing.count) : "—",
        errors: errorsFromLogs(logsBy.holded),
      },
      {
        key: "shopify",
        label: "Shopify",
        status: statusFromLogs(shopifyBase, logsBy.shopify),
        records_affected: "—",
        errors: errorsFromLogs(logsBy.shopify),
      },
      {
        key: "bixgrow",
        label: "BixGrow",
        status: statusFromLogs(bixgrowBase, logsBy.bixgrow),
        records_affected: "—",
        errors: errorsFromLogs(logsBy.bixgrow),
      },
      {
        key: "commissions",
        label: "Comissions",
        status: statusFromLogs(commissionsBase, logsBy.commissions),
        records_affected: "—",
        errors: errorsFromLogs(logsBy.commissions),
      },
    ];

    const m = { rows };
    lastOkRef.current.model = m;
    return m;
  }, [logsBy, holdedPing, shopifyPing]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Z2_1HoldedInvoicesThisMonth />
      <Z2Pipelines model={model} />
    </div>
  );
}