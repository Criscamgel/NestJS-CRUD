/** Score ≥ umbral → perfil confiable (alineado con UI). */
export const TRUST_SCORE_RELIABLE_MIN = 70;

export function isReliableTrustScore(score: number | null | undefined): boolean {
  return typeof score === 'number' && !Number.isNaN(score) && score >= TRUST_SCORE_RELIABLE_MIN;
}

/** Índice de riesgo 0–100 (mayor = más riesgo). */
export function riskIndexFromTrustScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - score)));
}

export type RiskLevelLabel = 'high' | 'medium' | 'low';

export function riskLevelFromIndex(index: number): RiskLevelLabel {
  if (index >= 60) return 'high';
  if (index >= 30) return 'medium';
  return 'low';
}
