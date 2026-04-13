/**
 * Escapa caracteres especiales de regex para usar el término en $regex de forma segura.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Devuelve condición de coincidencia parcial insensible a mayúsculas, o filtro vacío. */
export function buildRegexOrFilter<T>(
  search: string | undefined,
  fields: (keyof T & string)[],
): Record<string, unknown> {
  const term = search?.trim();
  if (!term) {
    return {};
  }
  const pattern = escapeRegex(term);
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: pattern, $options: 'i' },
    })),
  };
}
