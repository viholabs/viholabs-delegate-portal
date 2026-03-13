"use client";

import { useMemo, useState } from "react";

type ActorOption = {
  id: string;
  name: string;
  role: string;
  subtitle?: string;
};

const ACTORS_SEED: ActorOption[] = [
  {
    id: "melquisedec",
    name: "Lluís Vila Prat",
    role: "Melquisedec",
    subtitle: "Super Admin · Viholabs Biotech SL",
  },
  {
    id: "fernando",
    name: "Fernando Rueda Parra",
    role: "Super Admin",
    subtitle: "Control Room",
  },
  {
    id: "delegate-test",
    name: "Delegate Test",
    role: "Delegate",
    subtitle: "Actor de prueba",
  },
  {
    id: "encarnacion",
    name: "Encarnación Martín Ruiz",
    role: "Delegate",
    subtitle: "Red comercial",
  },
  {
    id: "isabel-sole",
    name: "Isabel Solé Mesas",
    role: "KOL",
    subtitle: "Ámbito clínico",
  },
];

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export default function ElElyonControlBlock() {
  const [query, setQuery] = useState("");
  const [selectedActorId, setSelectedActorId] = useState("melquisedec");

  const filteredActors = useMemo(() => {
    const q = normalize(query);

    if (!q) return ACTORS_SEED;

    return ACTORS_SEED.filter((actor) => {
      const haystack = normalize(
        `${actor.name} ${actor.role} ${actor.subtitle ?? ""}`,
      );
      return haystack.includes(q);
    });
  }, [query]);

  const selectedActor =
    ACTORS_SEED.find((actor) => actor.id === selectedActorId) ?? ACTORS_SEED[0];

  return (
    <section className="rounded-[32px] border border-[#D6C28A] bg-[#FBF6EC]">
      <div className="border-b border-[#D6C28A] px-6 py-5">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
          El-Elyon
        </div>

        <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.02em] text-[#5A2E3A]">
          Control soberano del portal
        </h2>

        <p className="mt-3 max-w-[980px] text-[16px] leading-8 text-[#6E5B43]">
          Bloque exclusivo de Melquisedec para gobernar la visión del portal por
          actor efectivo. Desde aquí se preparará el modo “ver como”, la
          supervisión transversal y el acceso soberano a la operación.
        </p>
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-[28px] border border-[#D6C28A] bg-white/70 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D6C28A] bg-[#FBF6EC] text-[18px] text-[#5A2E3A]">
              ◉
            </div>

            <div>
              <div className="text-[20px] font-semibold text-[#5A2E3A]">
                Ver portal como
              </div>

              <div className="text-[14px] text-[#6E5B43]">
                Selector preparado para miles de actores con búsqueda rápida.
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <div className="mb-2 text-[13px] font-medium text-[#6E5B43]">
                Buscar actor
              </div>

              <div className="relative">
                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-[#8A775C]">
                  ⌕
                </div>

                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Escribe nombre, rol o referencia…"
                  className="h-12 w-full rounded-[18px] border border-[#D6C28A] bg-[#FFFDFC] pl-11 pr-4 text-[15px] text-[#5A2E3A] outline-none transition placeholder:text-[#9A8C78] focus:border-[#C7AE6A]"
                />
              </div>
            </label>

            <label className="block">
              <div className="mb-2 text-[13px] font-medium text-[#6E5B43]">
                Actor efectivo
              </div>

              <div className="relative">
                <select
                  value={selectedActorId}
                  onChange={(event) => setSelectedActorId(event.target.value)}
                  className="h-12 w-full appearance-none rounded-[18px] border border-[#D6C28A] bg-[#FFFDFC] px-4 pr-11 text-[15px] text-[#5A2E3A] outline-none transition focus:border-[#C7AE6A]"
                >
                  {filteredActors.map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.name} · {actor.role}
                    </option>
                  ))}
                </select>

                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-[#8A775C]">
                  ▾
                </div>
              </div>
            </label>

            <div className="rounded-[22px] border border-[#E2D6C1] bg-[#FCF8F1] p-4">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A775C]">
                Actor seleccionado
              </div>

              <div className="mt-3 text-[20px] font-semibold text-[#5A2E3A]">
                {selectedActor.name}
              </div>

              <div className="mt-1 text-[14px] text-[#6E5B43]">
                {selectedActor.role}
                {selectedActor.subtitle ? ` · ${selectedActor.subtitle}` : ""}
              </div>

              <div className="mt-4 rounded-[18px] border border-dashed border-[#D6C28A] bg-white/60 px-4 py-3 text-[14px] leading-7 text-[#6E5B43]">
                Preparado para conectar con el flujo real de view-as. De momento
                este bloque actúa como contenedor canónico de la función.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#D6C28A] bg-white/70 p-5">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E5B43]">
            Estado
          </div>

          <div className="mt-3 text-[22px] font-semibold text-[#5A2E3A]">
            Preparado para gobernanza soberana
          </div>

          <div className="mt-4 space-y-3 text-[15px] leading-8 text-[#6E5B43]">
            <div className="rounded-[18px] border border-[#E2D6C1] bg-[#FCF8F1] px-4 py-3">
              View-as UI preparada
            </div>

            <div className="rounded-[18px] border border-[#E2D6C1] bg-[#FCF8F1] px-4 py-3">
              Búsqueda preparada para alta escala
            </div>

            <div className="rounded-[18px] border border-[#E2D6C1] bg-[#FCF8F1] px-4 py-3">
              Pendiente de conexión con actores reales y sesión efectiva
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}