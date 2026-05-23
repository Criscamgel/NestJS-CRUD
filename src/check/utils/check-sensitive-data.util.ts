/** Tiempo visible de datos sensibles tras crear el check (2 minutos). */
export const CHECK_SENSITIVE_MASK_DELAY_MS = 2 * 60 * 1000;

export const MASKED_CHECK_EMAIL = '••••••@••••.com';
export const MASKED_CHECK_MOBILE = '+•• ••• ••• ••••';

export function isCheckSensitiveDataMasked(
  createdAt: Date | string | undefined | null,
  now: Date = new Date(),
): boolean {
  if (createdAt == null) return false;
  const created =
    createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created >= CHECK_SENSITIVE_MASK_DELAY_MS;
}

type CheckSensitiveFields = {
  email?: string;
  documentNumber?: string;
  mobile?: string;
  createdAt?: Date | string | null;
};

export function applyCheckSensitiveMask<T extends CheckSensitiveFields>(
  check: T,
  now: Date = new Date(),
): T & { sensitiveFieldsMasked: boolean } {
  const masked = isCheckSensitiveDataMasked(check.createdAt, now);
  if (!masked) {
    return { ...check, sensitiveFieldsMasked: false };
  }
  return {
    ...check,
    email: MASKED_CHECK_EMAIL,
    mobile: MASKED_CHECK_MOBILE,
    /** La cédula nunca se enmascara: se conserva tal cual está en base de datos. */
    documentNumber: check.documentNumber,
    sensitiveFieldsMasked: true,
  };
}
