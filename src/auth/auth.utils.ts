/**
 * Misma normalización que en User (pre save): el login debe buscar con el mismo criterio.
 */
export function normalizeAuthEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Cuenta desactivada explícitamente. `undefined` / ausente se trata como activo (usuarios antiguos / default schema).
 */
export function isUserMarkedInactive(isActive: unknown): boolean {
  if (isActive === true) return false;
  if (isActive === false) return true;
  if (isActive === 'false') return true;
  if (isActive === 0) return true;
  return false;
}

/**
 * Base del front para enlaces en correos. `FRONTEND_PATH` puede ser:
 * - URL completa: `https://cheky.co` o `http://cheky.co`
 * - Solo host (legacy): `cheky.co` → se antepone `http://`
 */
export function getFrontendBaseUrl(): string {
  const raw = process.env.FRONTEND_PATH?.trim() ?? '';
  if (!raw) {
    return '';
  }
  const noTrailingSlash = raw.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(noTrailingSlash)) {
    return noTrailingSlash;
  }
  return `http://${noTrailingSlash}`;
}
