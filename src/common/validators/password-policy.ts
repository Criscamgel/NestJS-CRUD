/**
 * Regla única para contraseñas (login, registro, restablecer).
 * Requiere: mayúscula, minúscula, y (número O carácter especial).
 */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 50;

export const PASSWORD_STRENGTH_REGEX =
  /(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;

export const PASSWORD_MIN_LENGTH_MESSAGE = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;

export const PASSWORD_MAX_LENGTH_MESSAGE = `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`;

/** Mensaje al fallar el patrón (longitud va por MinLength/MaxLength). */
export const PASSWORD_COMPLEXITY_MESSAGE =
  'La contraseña debe incluir mayúscula, minúscula, y un número o un carácter especial.';
