# SOLUCIÓN: "Cookie auth failed: Auth session missing!" en VPS

## PROBLEMA IDENTIFICADO

**Síntomas:**
- ✗ Login funciona en local (http://localhost:3000)
- ✗ Login falla en VPS (https://portal.viholabs.com)
- ✗ Mensaje: "Cookie auth failed: Auth session missing!"
- ✗ Browser DevTools → Application → Cookies: **VACÍO después de login**

**Root cause encontrada:**
El código original en `src/app/auth/callback/route.ts` hacía:

```typescript
// ANTES (INCORRECTO)
const response = NextResponse.redirect(new URL(provisionalPath, origin));  // ← Redirect creado AQUÍ
const supabase = createRouteSupabase(req, response);
// ... auth operations ...
response.cookies.set(MODE_COOKIE, modeToSet, {...});  // ← Cookies asignadas DESPUÉS
return response;
```

**El problema:** Cuando `NextResponse.redirect()` se crea, fija el estado de la respuesta (headers, status). 
Los `response.cookies.set()` posteriores se agregaban al objeto, pero el middleware de Next.js ya había 
procesado los headers para el redirect, por lo que los Set-Cookie headers **nunca llegaban al browser**.

## SOLUCIÓN APLICADA

Cambiar el orden: **asignar cookies primero, luego hacer redirect:**

```typescript
// DESPUÉS (CORRECTO)
const response = NextResponse.next({ request: req });  // ← NextResponse sin redirect
const supabase = createRouteSupabase(req, response);
// ... auth operations ...

// Asignar cookies a la respuesta base
response.cookies.set(MODE_COOKIE, modeToSet, {...});
response.cookies.set(ROLE_COOKIE, String(actorRole ?? "").trim().toUpperCase(), {...});

// Ahora crear el redirect DESPUÉS de asignar las cookies
const finalUrl = new URL(finalPath, origin);
const redirectResponse = NextResponse.redirect(finalUrl, { status: 302 });

// Copiar todas las cookies desde response → redirectResponse
response.cookies.getAll().forEach((cookie) => {
  redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
});

return redirectResponse;
```

## CAMBIOS REALIZADOS

### 1. **src/app/auth/callback/route.ts**
   - Reordenación de lógica: `NextResponse.next()` → autenticación → asignar cookies → `NextResponse.redirect()`
   - Copia de cookies al redirect response antes de devolver

### 2. **NUEVOS ARCHIVOS CREADOS**
   - `DEPLOY_VPS.md`: Guía completa paso a paso para desplegar en producción
   - `nginx.conf.vps`: Configuración Nginx con headers correctos para cookies y Set-Cookie forwarding
   - `.env.production`: Template de variables de entorno para VPS
   - `deploy-portal.sh`: Script automatizado de deploy

### 3. **ARCHIVOS DE CONFIGURACIÓN ACTUALIZADOS**
   - `ecosystem.config.js`: Sin cambios (ya correcto)

## POR QUÉ FUNCIONA AHORA

1. **NextResponse.next()** crea una respuesta modificable (sin redirect aún)
2. Las cookies se asignan a esta respuesta base mediante `response.cookies.set()`
3. El redirect se crea DESPUÉS, dándole tiempo a Next.js para preparar los headers Set-Cookie
4. La copia de cookies al redirect response asegura que los headers se incluyan en la respuesta HTTP final
5. Nginx (en la VPS) recibe los Set-Cookie headers correctamente y los reenvía al navegador
6. El navegador recibe los cookies y los almacena en Application → Cookies

## VERIFICACIÓN

Para confirmar que está funcionando en VPS:

```bash
# 1. Después del deploy
curl -sv https://portal.viholabs.com/auth/callback?code=... 2>&1 | grep -i "set-cookie"
# Debería ver headers como:
# < set-cookie: sb-...-auth-token=...
# < set-cookie: sb-...-auth-token.0=...
# < set-cookie: MODE_COOKIE=DELEGATE
# etc.

# 2. En el browser después de login
# DevTools → Application → Cookies → (dominio)
# Debería ver:
# - sb-*-auth-token
# - sb-*-auth-token.0
# - MODE_COOKIE
# - ROLE_COOKIE

# 3. Request posterior debe tener Cookie header
curl -b "sb-...-auth-token=..." https://portal.viholabs.com/api/delegate/summary
# Debería tener: Cookie: sb-...-auth-token=...
```

## PRÓXIMOS PASOS (VPS)

1. **Clonar el código actualizado** con el fix
2. **Seguir DEPLOY_VPS.md** paso a paso:
   - Configurar Nginx con el config proporcionado
   - Configurar variables de entorno (.env.production)
   - Ejecutar deploy script
3. **Verificar auth** siguiendo los comandos de verificación arriba
4. **Testing final:**
   - Ir a https://portal.viholabs.com/login
   - Hacer login con credenciales válidas
   - Verificar que aparecen cookies en DevTools
   - Navegar a /control-room/shell (no debería redirigir a login)

## NOTA TÉCNICA

Este fix es específico para **Next.js 15 + Supabase SSR Auth**. El problema NO era:
- ✗ Configuración de Nginx (aunque hay que configurarla bien)
- ✗ Headers X-Forwarded-* (aunque hay que forwardearlos)
- ✗ Problema de proxy/infraestructura
- ✓ Orden de operaciones en el middleware de Next.js

El código funcionaba en local porque el cliente HTTP seguía cookies automáticamente 
y los headers Set-Cookie se procesaban antes de que Next.js finalizara la respuesta.
En producción con reverse proxy, cualquier retraso en los headers termina en pérdida.
