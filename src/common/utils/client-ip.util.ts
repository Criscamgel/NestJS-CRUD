import type { Request } from 'express';

/** IP del cliente detrás de proxy (Dokploy / nginx). */
export function resolveClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? req.ip ?? '';
}
