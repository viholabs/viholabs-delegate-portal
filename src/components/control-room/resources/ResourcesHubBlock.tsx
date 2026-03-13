"use client";

const ITEMS = [
  {
    key: "webinars",
    title: "Webinars",
    description: "Espacio reservado para sesiones en directo y grabaciones.",
  },
  {
    key: "cursos",
    title: "Cursos",
    description: "Espacio reservado para formación estructurada por itinerarios.",
  },
  {
    key: "materiales",
    title: "Materiales",
    description: "Espacio reservado para documentos, fichas y recursos de apoyo.",
  },
];

export default function ResourcesHubBlock() {
  return (
    <section className="rounded-[32px] border border-[#D6C28A] bg-[#FBF6EC]">
      <div className="border-b border-[#D6C28A] px-6 py-5">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
          Recursos
        </div>
        <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.02em] text-[#5A2E3A]">
          Centro de recursos
        </h2>
        <p className="mt-3 max-w-[980px] text-[16px] leading-8 text-[#6E5B43]">
          Bloque de contenidos del portal. De momento queda creado como
          estructura base, sin contenido interno.
        </p>
      </div>

      <div className="grid gap-5 px-6 py-6 md:grid-cols-3">
        {ITEMS.map((item) => (
          <article
            key={item.key}
            className="rounded-[28px] border border-[#D6C28A] bg-white/70 p-5"
          >
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A775C]">
              Disponible próximamente
            </div>

            <h3 className="mt-3 text-[24px] font-semibold text-[#5A2E3A]">
              {item.title}
            </h3>

            <p className="mt-3 text-[15px] leading-8 text-[#6E5B43]">
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}