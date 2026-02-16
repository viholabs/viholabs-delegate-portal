"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RobotAvatarSvg from "./RobotAvatarSvg";

/* --- ICONOS NATIVOS (Inline para evitar dependencias) --- */

function IconLoader(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function IconCamera(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function IconEdit(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function IconCopy(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function IconCheck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconLock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/* --- TYPES & UTILS --- */

type Lang = "ca" | "es" | "en" | "fr";

type Profile = {
  viholabs_id?: string | null;
  joined_at?: string | null;
  aka: string | null;
  display_name: string | null;
  effective_name: string | null;
  company: string | null;
  profile_type: string | null;
  typology: string | null; // (present en dades, però NO es mostra en UI)
  consent_image_policy: boolean;
  avatar_url: string | null;
  department: string | null;
  job_title: string | null;
  birthday: string | null;
};

type I18n = {
  g: { morning: string; afternoon: string; night: string };
  joined: string;
  tenure: string;
  id_label: string;
  upload_tooltip: string;
  consent_required: string;
  copy: string;
  saving: string;
  error: string;
  placeholder_aka: string;
  activate_upload: string;
  aka_hint: string;
};

function normalizeLang(raw: unknown): Lang | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("ca")) return "ca";
  if (v.startsWith("es")) return "es";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("fr")) return "fr";
  return null;
}

function resolvePortalLangFallback(): Lang {
  const htmlLang = typeof document !== "undefined" ? document.documentElement?.lang : "";
  return normalizeLang(htmlLang) || "es";
}

function timeKey(): "morning" | "afternoon" | "night" {
  const h = new Date().getHours();
  if (h >= 6 && h <= 13) return "morning";
  if (h >= 14 && h <= 20) return "afternoon";
  return "night";
}

async function safeReadJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "Non-JSON server response." };
  }
}

function firstNonEmpty(...xs: Array<any>): string {
  for (const x of xs) {
    const s = String(x ?? "").trim();
    if (s) return s;
  }
  return "";
}

function fmtDate(dIso: string | null | undefined, lang: Lang): string {
  const s = String(dIso ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  const loc = lang === "ca" ? "ca-ES" : lang === "es" ? "es-ES" : lang === "fr" ? "fr-FR" : "en-GB";
  return d.toLocaleDateString(loc, { year: "numeric", month: "2-digit", day: "2-digit" });
}

function tenureCompact(joinedAtIso: string | null | undefined, lang: Lang): string {
  const s = String(joinedAtIso ?? "").trim();
  if (!s) return "—";
  const d0 = new Date(s);
  if (Number.isNaN(d0.getTime())) return "—";
  const now = new Date();

  let months = (now.getFullYear() - d0.getFullYear()) * 12 + (now.getMonth() - d0.getMonth());
  if (now.getDate() < d0.getDate()) months -= 1;
  if (months < 0) months = 0;

  const years = Math.floor(months / 12);
  const rem = months % 12;

  const yLabel = lang === "ca" || lang === "es" ? "a" : "y";
  const mLabel = "m";

  if (years <= 0) {
    if (lang === "fr") return `${months} mois`;
    if (lang === "es" || lang === "ca") return `${months} meses`;
    return `${months} months`;
  }
  if (rem <= 0) return `${years}${yLabel}`;
  return `${years}${yLabel} ${rem}${mLabel}`;
}

const I18N: Record<Lang, I18n> = {
  ca: {
    g: { morning: "Bon dia", afternoon: "Bona tarda", night: "Bona nit" },
    joined: "ALTA",
    tenure: "ANTIGUITAT",
    id_label: "ID:",
    upload_tooltip: "Canviar foto",
    consent_required: "Sense accés",
    copy: "Copiat",
    saving: "Guardant...",
    error: "Error",
    placeholder_aka: "Com et diem?",
    activate_upload: "Habilitar foto",
    aka_hint: "Clic per canviar com et diem",
  },
  es: {
    g: { morning: "Buenos días", afternoon: "Buenas tardes", night: "Buenas noches" },
    joined: "ALTA",
    tenure: "ANTIGÜEDAD",
    id_label: "ID:",
    upload_tooltip: "Cambiar foto",
    consent_required: "Sin acceso",
    copy: "Copiado",
    saving: "Guardando...",
    error: "Error",
    placeholder_aka: "¿Cómo te llamamos?",
    activate_upload: "Habilitar foto",
    aka_hint: "Clic para cambiar cómo te llamamos",
  },
  en: {
    g: { morning: "Good morning", afternoon: "Good afternoon", night: "Good evening" },
    joined: "JOINED",
    tenure: "TENURE",
    id_label: "ID:",
    upload_tooltip: "Change photo",
    consent_required: "No access",
    copy: "Copied",
    saving: "Saving...",
    error: "Error",
    placeholder_aka: "Your preferred name?",
    activate_upload: "Enable photo",
    aka_hint: "Click to change your preferred name",
  },
  fr: {
    g: { morning: "Bonjour", afternoon: "Bon après-midi", night: "Bonsoir" },
    joined: "ENTRÉE",
    tenure: "ANCIENNETÉ",
    id_label: "ID:",
    upload_tooltip: "Changer photo",
    consent_required: "Pas d'accès",
    copy: "Copié",
    saving: "Enregistrement...",
    error: "Erreur",
    placeholder_aka: "Votre prénom ?",
    activate_upload: "Activer photo",
    aka_hint: "Cliquez pour modifier votre surnom",
  },
};

export default function IdentityBlock() {
  const [lang, setLang] = useState<Lang>("es");
  const t = useMemo(() => I18N[lang], [lang]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [akaDraft, setAkaDraft] = useState("");
  const [imgError, setImgError] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setLang(resolvePortalLangFallback()), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/community/profile", { method: "GET" });
        const data = await safeReadJson(res);
        if (!res.ok || !data?.ok) throw new Error("Load failed");

        const p = data.profile || {};
        if (cancelled) return;

        const nextProfile: Profile = {
          viholabs_id: p.viholabs_id ?? null,
          joined_at: p.joined_at ?? null,
          aka: typeof p.aka === "string" ? p.aka : null,
          display_name: typeof p.display_name === "string" ? p.display_name : null,
          effective_name: typeof p.effective_name === "string" ? p.effective_name : null,
          company: typeof p.company === "string" ? p.company : null,
          profile_type: typeof p.profile_type === "string" ? p.profile_type : null,
          typology: typeof p.typology === "string" ? p.typology : null,
          consent_image_policy: Boolean(p.consent_image_policy),
          avatar_url: typeof p.avatar_url === "string" ? p.avatar_url : null,
          department: typeof p.department === "string" ? p.department : null,
          job_title: typeof p.job_title === "string" ? p.job_title : null,
          birthday: p.birthday ?? null,
        };

        setProfile(nextProfile);
        setAkaDraft(firstNonEmpty(nextProfile.aka, nextProfile.display_name, nextProfile.effective_name));
        setImgError(false);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditingName]);

  async function saveAka() {
    if (!profile) return;
    const finalVal = akaDraft.trim();
    if (!finalVal) {
      setAkaDraft(firstNonEmpty(profile.aka, profile.display_name, profile.effective_name));
      setIsEditingName(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/community/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aka: finalVal }),
      });
      const data = await safeReadJson(res);
      if (data?.ok) {
        const p = data.profile;
        setProfile((prev) => (prev ? { ...prev, aka: p.aka } : null));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!profile?.consent_image_policy) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/community/avatar", { method: "POST", body: form });
      const data = await safeReadJson(res);
      if (data?.ok && data.avatar_url) {
        setProfile((prev) => (prev ? { ...prev, avatar_url: data.avatar_url } : null));
        setImgError(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copyId() {
    if (!profile?.viholabs_id) return;
    try {
      await navigator.clipboard.writeText(profile.viholabs_id);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    } catch {}
  }

  if (loading) {
    return (
      <div className="w-full h-48 flex items-center justify-center opacity-50">
        <IconLoader className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!profile) return null;

  const hasAvatar = Boolean(profile.avatar_url && profile.avatar_url.length > 10) && !imgError;
  const canUpload = profile.consent_image_policy;

  const officialName = firstNonEmpty(profile.display_name, profile.effective_name);
  const company = profile.company;
  const jobTitle = profile.job_title;

  const joinedDate = fmtDate(profile.joined_at, lang);
  const tenure = tenureCompact(profile.joined_at, lang);
  const greetingTime = t.g[timeKey()];

  return (
    <div className="relative w-full mb-6">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadPhoto(f);
        }}
      />

      {/* Título de Sección */}
      <div className="mb-3">
        <div className="text-[11px] uppercase tracking-[0.15em] font-medium" style={{ color: "var(--viho-muted)" }}>
          COMUNIDAD VIHOLABS
        </div>

        {/* Saludo + Nombre */}
        <div className="mt-2 leading-tight">
          <span className="text-[18px] font-semibold" style={{ color: "var(--viho-primary)" }}>
            {greetingTime},{" "}
          </span>

          <span className="group relative inline-block">
            {!isEditingName ? (
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="text-[18px] font-bold text-left hover:text-[var(--viho-primary)] transition-colors relative"
                style={{ color: "var(--viho-gold, var(--viho-text))" }}
                title={t.aka_hint}
              >
                {akaDraft}
                <span className="ml-2 inline-flex align-middle opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconEdit className="w-4 h-4 text-[var(--viho-primary)]" />
                </span>

                <span className="absolute -bottom-8 left-0 hidden group-hover:block z-20 pointer-events-none">
                  <span
                    className="bg-[var(--viho-surface)] border border-[var(--viho-border)] text-[10px] px-2 py-1 rounded shadow-sm whitespace-nowrap"
                    style={{ color: "var(--viho-muted)" }}
                  >
                    {t.aka_hint}
                  </span>
                </span>
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveAka();
                }}
                className="inline-block"
              >
                <input
                  ref={nameInputRef}
                  type="text"
                  value={akaDraft}
                  onChange={(e) => setAkaDraft(e.target.value)}
                  onBlur={() => void saveAka()}
                  placeholder={t.placeholder_aka}
                  className="bg-transparent text-[18px] font-bold outline-none border-b-2 border-[var(--viho-primary)] pb-0 min-w-[120px]"
                  style={{ color: "var(--viho-gold, var(--viho-text))" }}
                  autoFocus
                />
              </form>
            )}
          </span>
        </div>
      </div>

      {/* Targeta Canónica de Identidad */}
      <div
        className="group relative overflow-hidden rounded-xl border transition-all duration-300"
        style={{
          borderColor: "var(--viho-border)",
          background: "var(--viho-surface)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
        }}
      >
        <div className="p-5">
          {/* Foto arriba */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div
                className={`w-24 h-24 overflow-hidden rounded-[22px] border shadow-sm transition-transform duration-300 ${
                  canUpload ? "cursor-pointer hover:scale-[1.02]" : ""
                }`}
                style={{
                  background: "var(--viho-bg)",
                  borderColor: "var(--viho-border)",
                }}
                onClick={() => canUpload && fileRef.current?.click()}
                title={canUpload ? t.upload_tooltip : t.consent_required}
              >
                {hasAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url!}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-60 grayscale p-2">
                    <RobotAvatarSvg />
                  </div>
                )}

                {canUpload && !uploading && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <IconCamera className="w-6 h-6 text-white drop-shadow-md" />
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <IconLoader className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* Identificación debajo */}
            <div className="mt-4 w-full text-center">
              <div className="text-[15px] font-semibold leading-tight" style={{ color: "var(--viho-text)" }}>
                {officialName}
              </div>

              {/* ✅ UNA SOLA LÍNEA: "CEO · Viholabs Biotech" */}
              {(jobTitle || company) && (
                <div className="mt-2 text-[12px] opacity-70 truncate" style={{ color: "var(--viho-text)" }}>
                  {jobTitle && company ? `${jobTitle} · ${company}` : jobTitle || company}
                </div>
              )}
            </div>
          </div>

          {/* Separador sutil */}
          <div className="my-5 h-px w-full bg-[var(--viho-border)] opacity-60" />

          {/* Bloque de Datos Técnicos */}
          <div className="flex flex-col gap-2 font-mono" style={{ fontSize: "10px" }}>
            <div className="group/copy flex items-baseline gap-2 cursor-pointer" onClick={() => void copyId()} title="Copiar ID">
              <div className="w-20 font-sans uppercase tracking-wider font-bold opacity-40 shrink-0 text-[10px]" style={{ color: "var(--viho-text)" }}>
                {t.id_label}
              </div>
              <div className="opacity-70 flex-1 leading-tight relative top-[1px] break-all tracking-tight" style={{ color: "var(--viho-text)" }}>
                {profile.viholabs_id || "—"}
              </div>
              <div className="opacity-0 group-hover/copy:opacity-100 transition-opacity shrink-0 w-3">
                {justCopied ? <IconCheck className="w-3 h-3 text-green-600" /> : <IconCopy className="w-3 h-3 text-[var(--viho-primary)]" />}
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <div className="w-20 font-sans uppercase tracking-wider font-bold opacity-40 shrink-0 text-[10px]" style={{ color: "var(--viho-text)" }}>
                {t.joined}:
              </div>
              <div className="opacity-70 flex-1 leading-tight tracking-tight" style={{ color: "var(--viho-text)" }}>
                {joinedDate}
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <div className="w-20 font-sans uppercase tracking-wider font-bold opacity-40 shrink-0 text-[10px]" style={{ color: "var(--viho-text)" }}>
                {t.tenure}:
              </div>
              <div className="opacity-70 flex-1 leading-tight tracking-tight" style={{ color: "var(--viho-text)" }}>
                {tenure}
              </div>
            </div>
          </div>

          {!profile.consent_image_policy && (
            <div className="mt-5">
              <button
                onClick={() =>
                  void savePatch({ consent_image_policy: true }).then(() => setProfile((p) => (p ? { ...p, consent_image_policy: true } : p)))
                }
                className="w-full flex items-center justify-center gap-2 text-[10px] font-semibold py-2 px-3 rounded-lg border border-[var(--viho-border)] hover:border-[var(--viho-primary)] bg-[var(--viho-bg)] transition-colors opacity-80 hover:opacity-100"
                style={{ color: "var(--viho-text)" }}
                disabled={saving}
              >
                <IconLock className="w-3 h-3" />
                <span>{t.activate_upload}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  async function savePatch(patch: Record<string, any>) {
    setSaving(true);
    try {
      const res = await fetch("/api/community/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Save failed");
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }
}
