/** Puntuación 0–100 para listados, a partir del JSON guardado en `riskSealResponse`. */

function pickNum(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

export function trustScorePercentFromSnapshot(
  s: Record<string, unknown> | null | undefined,
): number | undefined {
  if (!s || typeof s !== 'object') return undefined;
  const trust = pickNum(s.trust_score);
  const credit = pickNum(s.credit_score);
  const raw = trust ?? credit;
  if (raw == null) return undefined;
  if (raw >= 0 && raw <= 1) return Math.round(raw * 100);
  return Math.min(100, Math.max(0, Math.round(raw)));
}
