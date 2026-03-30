"use client";

import Link from "next/link";

const actions = [
  {
    href: "/control-room/import",
    label: "Import Holded",
    description: "Executar import manual o revisar pipeline.",
  },
  {
    href: "/control-room/el-elyon",
    label: "Assignar client",
    description: "Obrir espai d’assignacions i overrides.",
  },
  {
    href: "/control-room/orders",
    label: "Crear pedido",
    description: "Anar directament a la consola de comandes.",
  },
  {
    href: "/control-room/invoices",
    label: "Registrar pago",
    description: "Obrir factures i seguiment de cobrament.",
  },
  {
    href: "/control-room/clients",
    label: "Abrir cliente",
    description: "Entrar al bloc operatiu de clients.",
  },
  {
    href: "/control-room/users",
    label: "Abrir actor",
    description: "Entrar a governança i usuaris.",
  },
];

export default function QuickActionsBlock() {
  return (
    <div style={card}>
      <div style={eyebrow}>Action</div>
      <div style={title}>Quick Actions</div>

      <div style={grid}>
        {actions.map((action) => (
          <Link key={action.href} href={action.href} style={linkCard}>
            <div style={linkTitle}>{action.label}</div>
            <div style={linkDescription}>{action.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid rgba(199,174,106,0.28)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(251,246,236,0.78)",
  minHeight: 150,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.7,
  fontWeight: 700,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.2,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const linkCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  textDecoration: "none",
  color: "inherit",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(255,255,255,0.72)",
};

const linkTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.2,
};

const linkDescription: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  opacity: 0.8,
};