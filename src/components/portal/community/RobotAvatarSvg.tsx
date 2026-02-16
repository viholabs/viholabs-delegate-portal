"use client";

export default function RobotAvatarSvg() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Robot" className="h-full w-full">
      <rect x="8" y="14" width="48" height="40" rx="14" fill="currentColor" opacity="0.08" />
      <rect x="14" y="20" width="36" height="28" rx="10" fill="currentColor" opacity="0.12" />
      <circle cx="26" cy="34" r="4" fill="currentColor" opacity="0.55" />
      <circle cx="38" cy="34" r="4" fill="currentColor" opacity="0.55" />
      <rect x="24" y="44" width="16" height="3" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="31" y="8" width="2" height="6" rx="1" fill="currentColor" opacity="0.35" />
      <circle cx="32" cy="7" r="2" fill="currentColor" opacity="0.35" />
    </svg>
  );
}
