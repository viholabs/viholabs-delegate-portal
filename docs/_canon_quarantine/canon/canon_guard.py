#!/usr/bin/env python3
import json, os, re, subprocess, sys
from pathlib import Path

def run(cmd):
    return subprocess.check_output(cmd, text=True).strip()

def fail(msg, details=None, code=2):
    print("\n❌ CANON GUARD FAIL:", msg)
    if details:
        print(details)
    print()
    sys.exit(code)

def ok(msg):
    print("✅", msg)

def load_rules(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        fail(f"No puedo leer ruleset JSON: {path}", str(e))

def git_changed_files():
    try:
        out = run(["git", "diff", "--name-only"])
        return [x for x in out.splitlines() if x.strip()]
    except Exception:
        return []

def path_is_under(p, prefix):
    return p == prefix or p.startswith(prefix)

def any_forbidden_path(changed, forbidden_paths):
    hits = []
    for f in changed:
        for forb in forbidden_paths:
            if forb.endswith("/"):
                if path_is_under(f, forb):
                    hits.append((f, forb))
            else:
                if f == forb:
                    hits.append((f, forb))
    return hits

def allowed_scope_only(changed, allowed_paths):
    # allowed_paths can contain directories or exact file paths
    illegal = []
    for f in changed:
        allowed = False
        for allow in allowed_paths:
            if allow.endswith("/"):
                if path_is_under(f, allow):
                    allowed = True
                    break
            else:
                if f == allow or path_is_under(f, allow + "/"):
                    allowed = True
                    break
        if not allowed:
            illegal.append(f)
    return illegal

def scan_file_for_patterns(file_path: Path, patterns):
    txt = file_path.read_text(encoding="utf-8", errors="ignore")
    hits = []
    for pat in patterns:
        if re.search(re.escape(pat), txt, flags=re.IGNORECASE):
            hits.append(pat)
    return hits

def check_traceability(file_path: Path, header_regex: str, max_lines: int):
    txt = file_path.read_text(encoding="utf-8", errors="ignore")
    head = "\n".join(txt.splitlines()[:max_lines])
    return re.search(header_regex, head, flags=re.IGNORECASE) is not None

def main():
    phase = sys.argv[1] if len(sys.argv) > 1 else "UI_SHELL_ONLY"
    ruleset_path = Path("canon/canon_rules.json")
    if not ruleset_path.exists():
        fail("Falta canon/canon_rules.json (ruleset)")

    rules = load_rules(ruleset_path)

    if phase not in rules.get("phases", {}):
        fail(f"Fase desconocida: {phase}. Fases válidas: {', '.join(rules['phases'].keys())}")

    phase_rules = rules["phases"][phase]

    # Changed files
    changed = git_changed_files()
    print("== VIHOLABS CANON GUARD ==")
    print("Phase:", phase)
    print("Changed files:", "(none)" if not changed else "")
    for f in changed:
        print(" -", f)
    print()

    if not changed:
        ok("No hay cambios. Repo limpio.")
        sys.exit(0)

    # Forbidden paths
    hits = any_forbidden_path(changed, phase_rules.get("forbidden_paths", []))
    if hits:
        details = "\n".join([f" - {f} (match: {forb})" for f, forb in hits])
        fail("Se tocaron rutas/archivos prohibidos por fase.", details)

    ok("Phase lock OK (no forbidden paths)")

    # Allowed scope
    illegal = allowed_scope_only(changed, phase_rules.get("allowed_paths", []))
    if illegal:
        details = "\n".join([f" - {f}" for f in illegal])
        fail("Cambios fuera del scope permitido (whitelist).", details)

    ok("Scope whitelist OK")

    # Canon prohibitions scanning (only on changed files)
    prohib = rules.get("canonical_prohibitions", {})
    for key, rule in prohib.items():
        patterns = rule.get("forbidden_patterns", [])
        msg = rule.get("message", f"Violación canónica: {key}")
        for f in changed:
            fp = Path(f)
            if not fp.exists():
                continue
            hits = scan_file_for_patterns(fp, patterns)
            if hits:
                details = f"Archivo: {f}\nPatrones detectados: {', '.join(hits)}"
                fail(msg, details)

        ok(f"{key}: OK")

    # Traceability
    tr = rules.get("traceability", {})
    if tr.get("required", False):
        header_rx = tr.get("header_regex", "AUDIT")
        max_lines = int(tr.get("max_lines_to_scan", 60))
        missing = []
        for f in changed:
            fp = Path(f)
            if not fp.exists():
                continue
            if fp.suffix.lower() in [".ts", ".tsx", ".js", ".jsx"]:
                if not check_traceability(fp, header_rx, max_lines):
                    missing.append(f)
        if missing:
            details = "\n".join([f" - {f}" for f in missing])
            fail(tr.get("message", "Falta trazabilidad."), details)

        ok("Trazabilidad OK (AUDIT TRACE presente)")

    print("\n✅ CANON GUARD PASSED\n")
    sys.exit(0)

if __name__ == "__main__":
    main()
