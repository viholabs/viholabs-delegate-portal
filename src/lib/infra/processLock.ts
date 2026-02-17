// src/lib/infra/processLock.ts
/**
 * VIHOLABS — Process Lock (CANÒNIC)
 *
 * Problem:
 * - In Next.js (dev + some runtimes), route handlers may run in different workers/processes.
 * - In-memory globalThis locks are NOT shared => concurrency leaks.
 *
 * Solution:
 * - Use an OS-level lock via atomic lockfile creation in /tmp (shared across workers on same host).
 * - TTL-based stale recovery.
 *
 * Contract:
 * - tryAcquireLock(ttlMs, key?) -> boolean
 * - releaseLock(key?) -> void
 *
 * Notes:
 * - No DB. No schema. No external deps.
 */

import fs from "node:fs";
import path from "node:path";

type Held = {
  filePath: string;
  fd: number;
  acquiredAt: number;
};

const GLOBAL_KEY = "__VIHO_LOCKFILES_HELD__";
const DEFAULT_KEY = "default";

function heldMap(): Map<string, Held> {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, Held>();
  return g[GLOBAL_KEY] as Map<string, Held>;
}

function lockPathFor(key: string): string {
  const safe = String(key || DEFAULT_KEY).replace(/[^a-zA-Z0-9._-]+/g, "_");
  return path.join("/tmp", `viholabs_lock_${safe}.lock`);
}

function nowMs(): number {
  return Date.now();
}

function isStale(filePath: string, ttlMs: number): boolean {
  try {
    const st = fs.statSync(filePath);
    const age = nowMs() - st.mtimeMs;
    return age > ttlMs;
  } catch {
    return false;
  }
}

function tryRemoveStale(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

/**
 * Try to acquire a lock.
 * - ttlMs: if existing lockfile is older than ttlMs, we treat it as stale and recover.
 * - key: optional lock namespace (default="default")
 */
export function tryAcquireLock(ttlMs: number, key?: string): boolean {
  const k = String(key || DEFAULT_KEY);
  const filePath = lockPathFor(k);

  // If we already hold it in this worker, treat as busy (no re-entrancy)
  const hm = heldMap();
  if (hm.has(k)) return false;

  // 1) Atomic create
  try {
    const fd = fs.openSync(filePath, "wx"); // fail if exists
    // write some metadata (best-effort)
    try {
      fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
      fs.fsyncSync(fd);
    } catch {
      // ignore
    }

    hm.set(k, { filePath, fd, acquiredAt: nowMs() });
    return true;
  } catch (e: any) {
    // If exists, maybe stale
    if (e?.code !== "EEXIST") return false;
  }

  // 2) Stale recovery
  if (ttlMs > 0 && isStale(filePath, ttlMs)) {
    tryRemoveStale(filePath);

    // retry once
    try {
      const fd = fs.openSync(filePath, "wx");
      try {
        fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
        fs.fsyncSync(fd);
      } catch {
        // ignore
      }

      heldMap().set(k, { filePath, fd, acquiredAt: nowMs() });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Release a held lock (best-effort).
 */
export function releaseLock(key?: string): void {
  const k = String(key || DEFAULT_KEY);
  const hm = heldMap();
  const held = hm.get(k);
  if (!held) return;

  hm.delete(k);

  try {
    fs.closeSync(held.fd);
  } catch {
    // ignore
  }

  try {
    fs.unlinkSync(held.filePath);
  } catch {
    // ignore
  }
}
