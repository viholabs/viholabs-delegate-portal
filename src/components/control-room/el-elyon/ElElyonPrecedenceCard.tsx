"use client";

export default function ElElyonPrecedenceCard() {
  return (
    <div className="rounded-[24px] border border-[#eee2ca] bg-[#fcfaf5] p-5">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-[#5a2e3a]">Regla de precedencia</h3>
      </div>

      <div className="space-y-3 text-sm text-[#6b7280]">
        <div className="rounded-2xl border border-[#eadfcf] bg-white px-4 py-3">
          <strong className="text-[#5a2e3a]">Delegado</strong>
          <div className="mt-1">override factura → base factura → delegado actual del cliente</div>
        </div>

        <div className="rounded-2xl border border-[#eadfcf] bg-white px-4 py-3">
          <strong className="text-[#5a2e3a]">Recomendador</strong>
          <div className="mt-1">override factura → base factura</div>
        </div>

        <div className="rounded-2xl border border-[#eadfcf] bg-white px-4 py-3">
          <strong className="text-[#5a2e3a]">Afiliado</strong>
          <div className="mt-1">override factura → atribución actual</div>
        </div>
      </div>
    </div>
  );
}