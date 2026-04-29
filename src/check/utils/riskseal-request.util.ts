import { BadRequestException } from '@nestjs/common';

/**
 * URL del endpoint de **nuevo** scoring (demo fullFrontend: `POST …/credit-scoring/v2`).
 * Acepta `REQUEST_RISKSEAL` como URL completa o solo el host base.
 */
export function resolveRiskSealScoringUrl(): string {
  const raw = process.env.REQUEST_RISKSEAL?.trim();
  if (!raw) {
    throw new BadRequestException(
      'Falta configurar REQUEST_RISKSEAL (URL de RiskSeal, p. ej. https://pentastar.riskseal.io/credit-scoring/v2).',
    );
  }
  const u = raw.replace(/\/+$/, '');
  if (/\/credit-scoring\/v2$/i.test(u)) {
    return u;
  }
  if (/\/credit-scoring$/i.test(u)) {
    return `${u}/v2`;
  }
  return `${u}/credit-scoring/v2`;
}

/**
 * Formato de teléfono que usa el demo contra RiskSeal: `+57` + 10 dígitos (celular CO).
 * Si el usuario ya envía E.164 (`+…`), se respeta.
 */
export function phoneForRiskSeal(mobile: string): string {
  const t = mobile.trim().replace(/\s/g, '');
  if (t.startsWith('+')) {
    return t;
  }
  const digits = t.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) {
    return `+57${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return digits.length > 0 ? `+${digits}` : t;
}

export type RiskSealNewReportBodyInput = {
  firstName: string;
  lastName: string;
  email: string;
  /** E.164, p. ej. `+573001234567` */
  phone: string;
};

/**
 * Cuerpo **solo** con las claves que acepta `POST …/credit-scoring/v2` para un informe nuevo.
 * Cualquier clave extra (p. ej. `id`) hace que RiskSeal busque un informe previo y responda
 * `Original report not found`.
 */
export function buildRiskSealNewReportBody(
  input: RiskSealNewReportBodyInput,
): Record<string, string> {
  return {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
  };
}
