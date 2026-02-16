"use client";

// src/components/control-room/technical/blocks/Z1SubsystemsLive.tsx
// VIHOLABS — TECH_BLOCK / Z1 live container (CANÒNIC)
// - NO fetch dins Z1Subsystems (presentational-only)
// - Container fa polling suau i injecta logs reals

import { useEffect, useMemo, useRef, useState } from "react";
import Z1Subsystems, {
  type Z1SubsystemStatus,
  type Z1LogSeverity,
} from "./Z1Subsystems";

type SubsystemKey = "holded" | "shopify" | "bixgrow" | "commissions";

type LogItem = {
  at: string;
  message: string;
  severity: Z1LogSeverity;
};

type ApiPayload = {
  ok: boolean;
  logs?: Record<SubsystemKey, LogItem[]>;
  error?: string;
};

type Z1Item = {
  key: string;
  label: string;
  status: Z1SubsystemStatus;
  logs?: LogItem[];
};

function statusFromLogs(logs?: LogItem[]): Z1SubsystemStatus {
  if (!logs || logs.length === 0) return "OK";
  if (logs.some((e) => e.severity === "CRITICAL")) return "CRITICAL";
  if (logs.some((e) => e.severity === "WARN")) return "DEGRADED";
  return "OK";
}

function stableKey(e: LogItem): string {
  return `${String(e.at)}|${String(e.severity)}|${String(e.message)}`;
}

export default function Z1SubsystemsLive() {
  const [logsBy, setLogsBy] = useState<Record<SubsystemKey, LogItem[]>>({
    holded: [],
    shopify: [],
    bixgrow: [],
    commissions: [],
  });

  // dedupe per subsistema per evitar “parpelleig”
  const lastSeenRef = useRef<Record<SubsystemKey, Set<string>>>({
    holded: new Set(),
    shopify: new Set(),
    bixgrow: new Set(),
    commissions: new Set(),
  });

  useEffect(() => {
    let alive = true;
    let timer: any = null;

    async function tick() {
      try {
        const res = await fetch("/api/control-room/tech/logs/latest", {
          method: "GET",
          headers: { accept: "application/json" },
          credentials: "include",
          cache: "no-store",
        });

        const data: ApiPayload = await res.json().catch(() => ({ ok: false }));

        if (!alive) return;

        if (res.ok && data?.ok && data.logs) {
          const next: Record<SubsystemKey, LogItem[]> = { ...logsBy };

          (Object.keys(data.logs) as SubsystemKey[]).forEach((k) => {
            const incoming = Array.isArray(data.logs?.[k]) ? (data.logs?.[k] as LogItem[]) : [];
            const seen = lastSeenRef.current[k] || new Set<string>();

            // dedupe + preservem ordre rebut
            const filtered: LogItem[] = [];
            for (const e of incoming) {
              const key = stableKey(e);
              if (seen.has(key)) continue;
              filtered.push(e);
            }

            // actualitzem set (mantenim memòria limitada)
            const merged = [...incoming].slice(0, 5);
            const newSeen = new Set<string>();
            for (const e of merged) newSeen.add(stableKey(e));
            lastSeenRef.current[k] = newSeen;

            next[k] = merged;
          });

          setLogsBy(next);
        }
      } catch {
        // no trenca; mantenim últim estat
      } finally {
        if (!alive) return;
        timer = setTimeout(tick, 3000); // 3s: suau
      }
    }

    tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items: Z1Item[] = useMemo(() => {
    const holded = logsBy.holded;
    const shopify = logsBy.shopify;
    const bixgrow = logsBy.bixgrow;
    const commissions = logsBy.commissions;

    return [
      { key: "holded", label: "Holded", status: statusFromLogs(holded), logs: holded.length ? holded : undefined },
      { key: "shopify", label: "Shopify", status: statusFromLogs(shopify), logs: shopify.length ? shopify : undefined },
      { key: "bixgrow", label: "BixGrow", status: statusFromLogs(bixgrow), logs: bixgrow.length ? bixgrow : undefined },
      { key: "commissions", label: "Commissions Engine", status: statusFromLogs(commissions), logs: commissions.length ? commissions : undefined },
    ];
  }, [logsBy]);

  return <Z1Subsystems items={items} />;
}
