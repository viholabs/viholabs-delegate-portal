// src/app/_not-found/page.tsx
/**
 * VIHOLABS — Not Found (canonical minimal)
 * Must exist to satisfy Next.js static collection.
 */
export const runtime = "nodejs";

export default function NotFoundPage() {
  return (
    <main className="p-6">
      <div className="text-xs uppercase tracking-widest opacity-70">VIHOLABS</div>
      <h1 className="mt-2 text-2xl font-semibold">No encontrado</h1>
      <p className="mt-2 text-sm opacity-80">
        La ruta solicitada no existe o no está disponible.
      </p>
    </main>
  );
}
