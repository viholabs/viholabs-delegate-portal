export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatDateYYYYMMDD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function monthsBetween(a: Date, b: Date) {
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(0, months);
}

export function greetingByHour(h: number) {
  if (h >= 6 && h <= 13) return "Buenos días";
  if (h >= 14 && h <= 20) return "Buenas tardes";
  return "Buenas noches";
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function weatherLabelFromCode(code: number) {
  if (code === 0) return "despejado";
  if (code === 1 || code === 2) return "poco nuboso";
  if (code === 3) return "nublado";
  if (code === 45 || code === 48) return "niebla";
  if (code >= 51 && code <= 57) return "llovizna";
  if (code >= 61 && code <= 67) return "lluvia";
  if (code >= 71 && code <= 77) return "nieve";
  if (code >= 80 && code <= 82) return "chubascos";
  if (code >= 95 && code <= 99) return "tormenta";
  return "tiempo variable";
}

export function kitchenLine(tempC: number, code: number) {
  const t = Math.round(tempC);
  const label = weatherLabelFromCode(code);

  if (label === "tormenta") return "Tormenta fuera. Hoy conviene ir a lo simple.";
  if (label === "lluvia" || label === "chubascos") return "Día de lluvia. Un té caliente encaja.";
  if (label === "nieve") return "Frío serio fuera. Paso corto, cabeza clara.";
  if (label === "niebla") return "Niebla. Día para no correr.";
  if (t >= 33) return "Con este calor, sin heroicidades.";
  if (t >= 28) return "Calor de verdad. Ritmo inteligente.";
  if (t <= 6) return "Hace frío. Algo caliente en las manos.";
  if (t <= 12) return "Fresco. Se trabaja mejor así.";
  return "Día normal. Eso también es un lujo.";
}

export function culturalPulseForDate(ymd: string) {
  const items = [
    "Hoy suena: Bach.",
    "Día para Debussy.",
    "Kafka hoy.",
    "Va, pensiero…",
    "Shakespeare: “Ripeness is all.”",
    "Marco Aurelio, a sorbos.",
    "Hoy pide jazz, sin prisa.",
    "Aria corta. Cabeza larga.",
  ];
  let h = 0;
  for (let i = 0; i < ymd.length; i++) h = (h * 33 + ymd.charCodeAt(i)) >>> 0;
  return items[h % items.length];
}

export function communityPulseForDate(ymd: string) {
  const items = [
    "Damos la bienvenida a nuevos partners esta semana.",
    "Hoy: continuidad sin ruido.",
    "Semana intensa en Viholabs. Buen pulso.",
    "Nuevo hito interno: seguimos afinando el sistema.",
    "Tres nuevas incorporaciones: bienvenidos.",
  ];
  let h = 0;
  for (let i = 0; i < ymd.length; i++) h = (h * 17 + ymd.charCodeAt(i)) >>> 0;
  return items[h % items.length];
}
