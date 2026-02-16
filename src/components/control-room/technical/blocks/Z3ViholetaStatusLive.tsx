"use client";

// src/components/control-room/technical/blocks/Z3ViholetaStatusLive.tsx

import { useEffect, useState } from "react";
import Z3ViholetaStatus from "./Z3ViholetaStatus";

type ApiState = "OK" | "IDLE" | "UNKNOWN";

type ApiPayload = {
  ok: boolean;
  state?: ApiState;
  last_session?: any;
  sessions?: any[];
  activity?: any;
  errors?: any[];
};

export default function Z3ViholetaStatusLive() {
  const [state, setState] = useState<ApiState>("UNKNOWN");
  const [sessions, setSessions] = useState<any[]>([]);
  const [activity, setActivity] = useState<any>(null);
  const [errors, setErrors] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    let t: any = null;

    async function load() {
      try {
        const res = await fetch("/api/control-room/tech/viholeta-status", {
          method: "GET",
          headers: { accept: "application/json" },
          credentials: "include",
          cache: "no-store",
        });

        const json: ApiPayload = await res.json().catch(() => ({ ok: false }));

        if (!alive) return;

        if (json?.ok) {
          setState((json.state as ApiState) ?? "UNKNOWN");
          setSessions(Array.isArray(json.sessions) ? json.sessions : []);
          setActivity(json.activity ?? null);
          setErrors(Array.isArray(json.errors) ? json.errors : []);
        } else {
          setState("UNKNOWN");
          setSessions([]);
          setActivity(null);
          setErrors([]);
        }
      } catch {
        if (!alive) return;
        setState("UNKNOWN");
        setSessions([]);
        setActivity(null);
        setErrors([]);
      }
    }

    load();
    t = setInterval(load, 15000);

    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, []);

  return <Z3ViholetaStatus state={state} sessions={sessions} activity={activity} errors={errors} />;
}
