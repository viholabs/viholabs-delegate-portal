#!/usr/bin/env bash
echo "== VIHOLABS Layout Integrity Audit =="

violations=$(grep -RIn --include="layout.tsx" \
  -E "min-h-screen|max-w-|mx-auto|px-|py-|grid|flex" \
  src/app || true)

if [ -z "$violations" ]; then
  echo "OK: layouts nets (wrapper-only)"
else
  echo "VIOLACIONS DETECTADES:"
  echo "$violations"
fi
