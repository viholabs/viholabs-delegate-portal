// src/app/(kol)/kol/dashboard/page.tsx

export const runtime = "nodejs";

export default function KolDashboardPage() {
  return (
    <main>
      <h1 style={{ fontSize: "24px", fontWeight: 600 }}>
        KOL Dashboard (MVP)
      </h1>

      <p style={{ marginTop: "12px", opacity: 0.8 }}>
        Panel exclusivo para Key Opinion Leaders.
      </p>
    </main>
  );
}
