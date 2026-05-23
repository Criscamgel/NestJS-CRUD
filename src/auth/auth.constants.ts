import {
  isUserDeactivatedByAdmin,
} from '../users/user-account.constants';

/** Membresía vencida o cuenta inactiva sin desactivación explícita por admin. */
export const INACTIVE_ACCOUNT_MESSAGE =
  'Cuenta inactiva. Un administrador debe reactivarla.';

/** Desactivación manual desde el panel de usuarios (rol administrador). */
export const ADMIN_INACTIVE_ACCOUNT_MESSAGE =
  'Su cuenta ha sido desactivada por el administrador de su empresa. Contacte al administrador para reactivarla.';

export function getInactiveAccountMessage(
  deactivationReason: unknown,
): string {
  if (isUserDeactivatedByAdmin(deactivationReason)) {
    return ADMIN_INACTIVE_ACCOUNT_MESSAGE;
  }
  return INACTIVE_ACCOUNT_MESSAGE;
}
