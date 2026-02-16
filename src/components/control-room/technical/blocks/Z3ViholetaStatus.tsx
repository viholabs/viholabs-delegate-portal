"use client";

// src/components/control-room/technical/blocks/Z3ViholetaStatus.tsx

type ViholetaState = "OK" | "IDLE" | "UNKNOWN";

type SessionRow = {
  id: string;
  actor_id: string;
  mode: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type Activity = {
  sessions_in_view: number;
  window_hours: number | null;
  modes: string[];
};

type SemanticError = {
  type: string;
  context: string;
  impact: string;
};

function stateColor(s: ViholetaState) {
  if (s === "OK") return "var(--viho-success)";
  if (s === "UNKNOWN") return "var(--viho-warning)";
  return "var(--viho-muted)";
}

export default function Z3ViholetaStatus(props: {
  state: ViholetaState;
  sessions: SessionRow[];
  activity: Activity | null;
  errors: SemanticError[];
}) {
  const { state, sessions, activity, errors } = props;

  const last = Array.isArray(sessions) && sessions.length ? sessions[0] : null;

  return (
    <section
      className="rounded-2xl border px-4 py-3"
      style={{ borderColor: "var(--viho-border)", background: "var(--viho-surface)" }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--viho-muted)" }}>
          VIHOLETA — OBSERVABILITY
        </div>
        <div className="text-xs font-semibold" style={{ color: stateColor(state) }}>
          {state}
        </div>
      </div>

      <div className="mt-2 text-xs" style={{ color: "var(--viho-muted)" }}>
        Lectura institucional. Sense detalls tècnics.
      </div>

      {/* Z3.2 Activitat rellevant (derivada) */}
      <div className="mt-3 rounded-xl border px-3 py-2" style={{ borderColor: "var(--viho-border)" }}>
        <div className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--viho-muted)" }}>
          ACTIVITAT (RESUM)
        </div>

        <div className="mt-2 text-xs" style={{ color: "var(--viho-muted)" }}>
          Sessions (vista):{" "}
          <span style={{ color: "var(--viho-primary)", fontWeight: 600 }}>
            {activity?.sessions_in_view ?? 0}
          </span>
          {activity?.window_hours != null ? (
            <>
              {" "}
              · Finestra:{" "}
              <span style={{ color: "var(--viho-primary)", fontWeight: 600 }}>
                {activity.window_hours}h
              </span>
            </>
          ) : null}
          {activity?.modes?.length ? (
            <>
              {" "}
              · Modes:{" "}
              <span style={{ color: "var(--viho-primary)", fontWeight: 600 }}>
                {activity.modes.join(", ")}
              </span>
            </>
          ) : null}
        </div>

        <div className="mt-1 text-[11px]" style={{ color: "var(--viho-muted)" }}>
          Última sessió:{" "}
          <span style={{ color: "var(--viho-primary)", fontWeight: 600 }}>
            {last ? `${last.mode} · ${last.title ?? "—"}` : "—"}
          </span>
        </div>
      </div>

      {/* Z3.1 Sessions (històric curt) */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--viho-muted)" }}>
          SESSIONS (ÚLTIMES 5)
        </div>

        <div className="mt-2 space-y-2">
          {sessions && sessions.length ? (
            sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: "var(--viho-border)" }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xs" style={{ color: "var(--viho-primary)", fontWeight: 600 }}>
                    {s.mode}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--viho-muted)", whiteSpace: "nowrap" }}>
                    {s.created_at}
                  </div>
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--viho-muted)" }}>
                  {s.title ?? "—"}
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs" style={{ color: "var(--viho-muted)" }}>
              Sense sessions registrades.
            </div>
          )}
        </div>
      </div>

      {/* Z3.3 Errors semàntics (si existeixen) */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--viho-muted)" }}>
          ERRORS (SEMÀNTICS)
        </div>

        {errors && errors.length ? (
          <div className="mt-2 space-y-2">
            {errors.slice(0, 3).map((e, idx) => (
              <div
                key={`${e.type}-${idx}`}
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: "var(--viho-border)" }}
              >
                <div className="text-xs" style={{ color: "var(--viho-primary)", fontWeight: 600 }}>
                  {String(e.type || "UNKNOWN").toUpperCase()}
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--viho-muted)" }}>
                  {e.context}
                </div>
                <div className="mt-1 text-[11px]" style={{ color: "var(--viho-muted)" }}>
                  Impacte: {e.impact}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-xs" style={{ color: "var(--viho-muted)" }}>
            Sense errors registrats (domini sessions).
          </div>
        )}
      </div>
    </section>
  );
}
