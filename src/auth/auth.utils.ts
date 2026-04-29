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
 * Normaliza a origen sin barra final. Si no trae protocolo, se asume `https://`.
 */
function normalizeFrontendBase(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '');
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) {
    return t;
  }
  return `https://${t.replace(/^\/+/, '')}`;
}

/**
 * La landing vive en `cheky.co` / `www.cheky.co`; la SPA de panel y auth está en `app.cheky.co`.
 * Cualquier base que apunte solo al apex (landing) se reescribe para enlaces de correo.
 */
function rewriteChekyLandingToWebApp(url: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === 'cheky.co' || h === 'www.cheky.co') {
      return 'https://app.cheky.co';
    }
  } catch {
    /* ignore */
  }
  return url;
}

/**
 * Base URL de la **webApp** (donde vive `/auth/reset-password`).
 * Usada en correos de bienvenida y recuperación de contraseña.
 *
 * 1. `PUBLIC_WEB_APP_URL` — si está definida, se usa tal cual (sin reescritura).
 * 2. Si no: `FRONTEND_URL` o `FRONTEND_PATH` (el primero con valor); luego se reescribe
 *    apex `cheky.co` / `www.cheky.co` → `https://app.cheky.co` (típico cuando `FRONTEND_URL` es la landing).
 * 3. Sin ninguna variable: `production` → `https://app.cheky.co`; si no → `http://localhost:5173`.
 */
export function getFrontendBaseUrl(): string {
  const webApp = process.env.PUBLIC_WEB_APP_URL?.trim() ?? '';
  const frontUrl = process.env.FRONTEND_URL?.trim() ?? '';
  const frontPath = process.env.FRONTEND_PATH?.trim() ?? '';

  if (webApp) {
    return normalizeFrontendBase(webApp);
  }

  const fromEnv = frontUrl || frontPath;
  if (fromEnv) {
    const base = normalizeFrontendBase(fromEnv);
    return rewriteChekyLandingToWebApp(base);
  }

  return process.env.NODE_ENV === 'production'
    ? 'https://app.cheky.co'
    : 'http://localhost:5173';
}
