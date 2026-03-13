"use client";

import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import RobotAvatarSvg from "./RobotAvatarSvg";

function IconLoader(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function IconCamera(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function IconCopy(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconSpark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2l1.35 4.65L18 8l-4.65 1.35L12 14l-1.35-4.65L6 8l4.65-1.35z" />
    </svg>
  );
}

type Lang = "ca" | "es" | "en" | "fr";

type Profile = {
  viholabs_id?: string | null;
  joined_at?: string | null;
  aka: string | null;
  display_name: string | null;
  effective_name: string | null;
  company: string | null;
  profile_type: string | null;
  typology: string | null;
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
  const htmlLang =
    typeof document !== "undefined" ? document.documentElement?.lang : "";
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
  const loc =
    lang === "ca"
      ? "ca-ES"
      : lang === "es"
        ? "es-ES"
        : lang === "fr"
          ? "fr-FR"
          : "en-GB";
  return d.toLocaleDateString(loc, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function tenureCompact(joinedAtIso: string | null | undefined, lang: Lang): string {
  const s = String(joinedAtIso ?? "").trim();
  if (!s) return "—";
  const d0 = new Date(s);
  if (Number.isNaN(d0.getTime())) return "—";
  const now = new Date();

  let months =
    (now.getFullYear() - d0.getFullYear()) * 12 +
    (now.getMonth() - d0.getMonth());
  if (now.getDate() < d0.getDate()) months -= 1;
  if (months < 0) months = 0;

  const years = Math.floor(months / 12);
  const rem = months % 12;

  if (years <= 0) {
    if (lang === "fr") return `${months} mois`;
    if (lang === "es" || lang === "ca") return `${months} meses`;
    return `${months} months`;
  }

  const yLabel = lang === "ca" || lang === "es" ? "a" : "y";
  const mLabel = "m";

  if (rem <= 0) return `${years}${yLabel}`;
  return `${years}${yLabel} ${rem}${mLabel}`;
}

const I18N: Record<Lang, I18n> = {
  ca: {
    g: { morning: "Bon dia", afternoon: "Bona tarda", night: "Bona nit" },
    joined: "ALTA",
    tenure: "ANTIGUITAT",
    id_label: "Viholabs ID",
    upload_tooltip: "Canviar foto",
    consent_required: "Sense accés",
    copy: "Copiat",
    saving: "Guardant...",
    placeholder_aka: "Com et diem?",
    activate_upload: "Habilitar foto",
    aka_hint: "Clic per canviar com et diem",
  },
  es: {
    g: { morning: "Buenos días", afternoon: "Buenas tardes", night: "Buenas noches" },
    joined: "ALTA",
    tenure: "ANTIGÜEDAD",
    id_label: "Viholabs ID",
    upload_tooltip: "Cambiar foto",
    consent_required: "Sin acceso",
    copy: "Copiado",
    saving: "Guardando...",
    placeholder_aka: "¿Cómo te llamamos?",
    activate_upload: "Habilitar foto",
    aka_hint: "Clic para cambiar cómo te llamamos",
  },
  en: {
    g: { morning: "Good morning", afternoon: "Good afternoon", night: "Good evening" },
    joined: "JOINED",
    tenure: "TENURE",
    id_label: "Viholabs ID",
    upload_tooltip: "Change photo",
    consent_required: "No access",
    copy: "Copied",
    saving: "Saving...",
    placeholder_aka: "Your preferred name?",
    activate_upload: "Enable photo",
    aka_hint: "Click to change your preferred name",
  },
  fr: {
    g: { morning: "Bonjour", afternoon: "Bon après-midi", night: "Bonsoir" },
    joined: "ENTRÉE",
    tenure: "ANCIENNETÉ",
    id_label: "Viholabs ID",
    upload_tooltip: "Changer photo",
    consent_required: "Pas d'accès",
    copy: "Copié",
    saving: "Enregistrement...",
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
        const res = await fetch("/api/community/profile", {
          method: "GET",
          cache: "no-store",
        });

        const data = await safeReadJson(res);

        if (!res.ok || !data?.ok) {
          if (!cancelled) setProfile(null);
          return;
        }

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
        setAkaDraft(
          firstNonEmpty(
            nextProfile.aka,
            nextProfile.display_name,
            nextProfile.effective_name,
          ),
        );
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
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  async function saveAka() {
    if (!profile) return;

    const finalVal = akaDraft.trim();
    if (!finalVal) {
      setAkaDraft(
        firstNonEmpty(profile.aka, profile.display_name, profile.effective_name),
      );
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
      setIsEditingName(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!profile?.consent_image_policy) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/community/avatar", {
        method: "POST",
        body: form,
      });

      const data = await safeReadJson(res);

      if (data?.ok && data.avatar_url) {
        setProfile((prev) =>
          prev ? { ...prev, avatar_url: data.avatar_url } : null,
        );
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
      setTimeout(() => setJustCopied(false), 1600);
    } catch {}
  }

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

  if (loading) {
    return (
      <div className="flex h-24 w-full items-center justify-center opacity-50">
        <IconLoader className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const hasAvatar =
    Boolean(profile.avatar_url && profile.avatar_url.length > 10) && !imgError;
  const canUpload = profile.consent_image_policy;

  const officialName = firstNonEmpty(
    profile.display_name,
    profile.effective_name,
    akaDraft,
  );
  const company = profile.company;
  const jobTitle = profile.job_title;

  const joinedDate = fmtDate(profile.joined_at, lang);
  const tenure = tenureCompact(profile.joined_at, lang);
  const greetingTime = t.g[timeKey()];

  return (
    <section className="w-full px-0 py-0">
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

      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <IconSpark className="h-3.5 w-3.5 shrink-0 text-[#F26A21]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7A5A45]">
            IDENTIDAD
          </span>
          <div className="h-px flex-1 bg-[#D6C28A]" />
        </div>

        <div className="mb-4 min-w-0 leading-tight">
          <span className="text-[15px] font-semibold text-[#5A2E3A] sm:text-[16px]">
            {greetingTime},{" "}
          </span>

          {!isEditingName ? (
            <span
              onClick={() => setIsEditingName(true)}
              className="cursor-text break-words text-[16px] font-bold sm:text-[17px]"
              style={{ color: "#F26A21" }}
              title={t.aka_hint}
            >
              {akaDraft}
            </span>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveAka();
              }}
              className="inline-block max-w-full"
            >
              <input
                ref={nameInputRef}
                type="text"
                value={akaDraft}
                onChange={(e) => setAkaDraft(e.target.value)}
                onBlur={() => void saveAka()}
                placeholder={t.placeholder_aka}
                className="max-w-full min-w-0 border-b border-[#F26A21] bg-transparent pb-0 text-[16px] font-bold outline-none sm:text-[17px]"
                style={{ color: "#F26A21" }}
                autoFocus
              />
            </form>
          )}
        </div>

        <div className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 sm:grid-cols-[96px_minmax(0,1fr)]">
          <div className="relative">
            <div
              className={`relative h-[88px] w-[88px] overflow-hidden rounded-[22px] border border-[#D6C28A] bg-white/70 shadow-sm sm:h-[96px] sm:w-[96px] ${
                canUpload ? "cursor-pointer" : ""
              }`}
              onClick={() => canUpload && fileRef.current?.click()}
              title={canUpload ? t.upload_tooltip : t.consent_required}
            >
              {hasAvatar ? (
                <img
                  src={profile.avatar_url!}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-2 opacity-75">
                  <RobotAvatarSvg />
                </div>
              )}

              {uploading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                  <IconLoader className="h-5 w-5 animate-spin text-white" />
                </div>
              ) : null}
            </div>

            {canUpload ? (
              <div className="absolute -bottom-1 -right-1 rounded-full border border-[#D6C28A] bg-white p-1.5 shadow-sm">
                <IconCamera className="h-3.5 w-3.5 text-[#5A2E3A]" />
              </div>
            ) : null}
          </div>

          <div className="min-w-0 self-center">
            <div
              className="min-w-0 break-words text-[clamp(14px,2.5vw,18px)] font-bold leading-[1.02] tracking-[-0.02em] text-[#2F251E]"
              style={{ overflowWrap: "anywhere" }}
            >
              {officialName}
            </div>

            {(jobTitle || company) ? (
              <div
                className="mt-1.5 text-[12px] leading-[1.45] text-[#6E5B43]"
                style={{ overflowWrap: "anywhere" }}
              >
                {jobTitle && company
                  ? `${jobTitle} · ${company}`
                  : jobTitle || company}
              </div>
            ) : null}
          </div>

          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A775C]">
                {t.joined}
              </div>
              <div className="mt-1 text-[15px] font-medium leading-tight text-[#2F251E]">
                {joinedDate}
              </div>
            </div>

            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A775C]">
                {t.tenure}
              </div>
              <div
                className="mt-1 text-[15px] font-medium leading-tight text-[#2F251E]"
                style={{ overflowWrap: "anywhere" }}
              >
                {tenure}
              </div>
            </div>
          </div>

          <div className="col-span-2 min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A775C]">
                  {t.id_label}:
                </div>
                <div
                  className="mt-1 font-mono text-[11px] leading-5 text-[#2F251E] sm:text-[12px]"
                  style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                >
                  {profile.viholabs_id || "—"}
                </div>
              </div>

              {profile.viholabs_id ? (
                <button
                  type="button"
                  onClick={() => void copyId()}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D6C28A] bg-white transition hover:scale-[1.03]"
                  title={t.copy}
                >
                  {justCopied ? (
                    <IconCheck className="h-4 w-4 text-green-600" />
                  ) : (
                    <IconCopy className="h-4 w-4 text-[#5A2E3A]" />
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {!profile.consent_image_policy ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                void savePatch({ consent_image_policy: true }).then(() =>
                  setProfile((p) =>
                    p ? { ...p, consent_image_policy: true } : p,
                  ),
                )
              }
              className="rounded-full border border-[#D6C28A] bg-white/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5A2E3A] transition hover:bg-white"
            >
              {saving ? t.saving : t.activate_upload}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}