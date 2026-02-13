#!/usr/bin/env bash
set -euo pipefail

# Uso:
#   ./canon_guard.sh            -> fase por defecto UI_SHELL_ONLY
#   ./canon_guard.sh UI_ONLY    -> fase más amplia (si se autoriza)

PHASE="${1:-UI_SHELL_ONLY}"

python3 canon/canon_guard.py "$PHASE"
