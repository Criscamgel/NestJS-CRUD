/** Cuenta desactivada manualmente por un administrador de la empresa. */
export const USER_DEACTIVATION_REASON_ADMIN = 'admin';

/** Cuenta desactivada por membresía vencida o suspendida. */
export const USER_DEACTIVATION_REASON_MEMBERSHIP = 'membership_expired';

export function isUserDeactivatedByAdmin(
  deactivationReason: unknown,
): boolean {
  return deactivationReason === USER_DEACTIVATION_REASON_ADMIN;
}

/** Usuarios que el sistema puede reactivar al renovar o validar la membresía. */
export function userFilterReactivatableByMembership(): Record<string, unknown> {
  return {
    deactivationReason: { $ne: USER_DEACTIVATION_REASON_ADMIN },
  };
}

/** Administrador de empresa (no superAdmin). */
export function isCompanyAdminActor(user: {
  roles?: string[];
  role?: string;
}): boolean {
  const roles = user.roles || [];
  const legacy = user.role;
  const isSuper =
    roles.includes('superAdmin') || legacy === 'superAdmin';
  if (isSuper) return false;
  return roles.includes('admin') || legacy === 'admin';
}
