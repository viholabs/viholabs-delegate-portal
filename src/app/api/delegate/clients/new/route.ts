// src/app/api/delegate/clients/new/route.ts
export const runtime = "nodejs";

// Reutiliza exactamente el endpoint correcto:
//  - GET: búsqueda de clientes (recomendadores, etc.)
//  - POST: crear cliente + (opcional) recomendación
export { GET, POST } from "../route";
