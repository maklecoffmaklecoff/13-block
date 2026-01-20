// js/validators.js
export const STATS_KEYS = [
  { key: "hp", label: "❤️ Хп-шка" },
  { key: "energy", label: "⚡️ Энергия" },
  { key: "respect", label: "👥 Уважение" },
  { key: "evasion", label: "🏃 Уклонение" },
  { key: "armor", label: "🛡️ Броня" },
  { key: "resistance", label: "🚧 Сопротивление" },
  { key: "bloodRes", label: "🩸 Сопротивление крови" },
  { key: "poisonRes", label: "☠️ Сопротивление яду" }
];

export function clampInt(v, min, max){
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  if (Number.isNaN(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function validateStats(stats){
  const out = {};
  for (const s of STATS_KEYS){
    const n = clampInt(stats?.[s.key], 0, 9999);
    if (n === null) return { ok:false, error:`Поле "${s.label}" должно быть числом 0-9999` };
    out[s.key] = n;
  }
  return { ok:true, value: out };
}
