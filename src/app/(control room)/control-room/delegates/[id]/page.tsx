// src/app/(control room)/control-room/delegates/[id]/page.tsx
// Ruta del detalle de un delegado individual.
// Envuelve DelegateDetailModule (cliente) dentro del layout de Control Room.

import DelegateDetailModule from "@/components/control-room/delegates/detail/DelegateDetailModule";

export const dynamic = "force-dynamic";

export default async function DelegateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DelegateDetailModule delegateId={id} />;
}
