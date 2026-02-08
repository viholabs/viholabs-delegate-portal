#!/usr/bin/env bash
set -euo pipefail

echo "🔎 Verificant UI Canònica..."

# IMPORTANT:
# - Aquest checker valida UI real (pantalles / CSS).
# - IGNORA el contracte de migració i altres fitxers canònics que poden contenir "paraules prohibides"
#   perquè justament les documenten (p.ex. ui-canon/migration.ts).

# 1) On busquem: només src/app (UI) + globals.css
# 2) Què ignorem sempre: node_modules, .next, ui-canon (tokens i migració), fitxers minificats
GREP_EXCLUDES=(
  "--exclude-dir=node_modules"
  "--exclude-dir=.next"
  "--exclude-dir=ui-canon"
  "--exclude=*.min.*"
)

# Helper: retorna 0 si NO es troba, 1 si es troba (i imprimeix matches)
check_absent () {
  local label="$1"
  local pattern="$2"
  local path="$3"

  if grep -RIn "${GREP_EXCLUDES[@]}" -E "$pattern" "$path" >/dev/null 2>&1; then
    echo "❌ PROHIBIT: $label"
    # Mostrem on surt (per arreglar ràpid)
    grep -RIn "${GREP_EXCLUDES[@]}" -E "$pattern" "$path" || true
    return 1
  else
    echo "✅ OK: $label"
    return 0
  fi
}

ok=true

# A) "Slate intrús" (només en UI real)
check_absent 'Color slate #111827' '#111827' 'src/app' || ok=false
check_absent 'RGBA slate (17,24,39,...)' 'rgba\(\s*17\s*,\s*24\s*,\s*39\s*,' 'src/app' || ok=false
check_absent 'RGBA slate (15,23,42,...)' 'rgba\(\s*15\s*,\s*23\s*,\s*42\s*,' 'src/app' || ok=false

# B) Gradients prohibits (UI real)
check_absent 'Linear gradient' '(linear-gradient)' 'src/app' || ok=false
check_absent 'Radial gradient' '(radial-gradient)' 'src/app' || ok=false
check_absent 'Conic gradient' '(conic-gradient)' 'src/app' || ok=false

# C) globals.css també (per si algú hi reintrodueix gradients)
check_absent 'Gradients a globals.css' '(conic-gradient|linear-gradient|radial-gradient)' 'src/app/globals.css' || ok=false

echo
if $ok; then
  echo "🟢 UI CANÒNICA OK"
  exit 0
else
  echo "🔴 UI CANÒNICA AMB ERRORS"
  exit 1
fi
