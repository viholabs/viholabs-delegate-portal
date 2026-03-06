// src/app/api/delegate/clients/new/route.ts
//
// Alias canónico de creación de cliente.
// Reutiliza exactamente el POST ya implementado en ../route
// para evitar duplicar lógica y eliminar errores de imports.

import { POST as CreateClientPost } from "../route";

export const runtime = "nodejs";

export const POST = CreateClientPost;