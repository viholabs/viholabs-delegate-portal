"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type CorpusVersion = {
  code: string;
  label: string;
  is_active: boolean;
};

export default function ViholetaCorpusCard() {
  const [versions, setVersions] = useState<CorpusVersion[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/viholeta/corpus-version/status");
      const j = await r.json();
      if (!j?.ok) return;

      setVersions(j.versions ?? []);
      setActive(j.active_version ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function activate(code: string) {
    setBusy(code);
    try {
      const r = await fetch("/api/viholeta/corpus-version/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const j = await r.json();
      if (!j?.ok) {
        alert(j?.detail ?? "Activation failed");
        return;
      }

      await load(); // refresh canònic
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Viholeta Corpus Governance</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span>Active:</span>
          <Badge>{active ?? "none"}</Badge>
        </div>

        <div className="space-y-2">
          {versions.map((v) => (
            <div key={v.code} className="flex items-center justify-between rounded-lg border p-2">
              <div className="flex items-center gap-2">
                <span>{v.label}</span>
                {v.is_active && <Badge>ACTIVE</Badge>}
              </div>

              {!v.is_active && (
                <Button className="h-8 px-3 text-xs" disabled={busy === v.code} onClick={() => activate(v.code)}>
                  Activate
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
