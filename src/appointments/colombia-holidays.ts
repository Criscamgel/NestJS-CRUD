/**
 * Festivos en Colombia 2026.
 * Incluye festivos fijos y los trasladados al lunes (Ley Emiliani).
 * Formato: MM-DD
 */
const COLOMBIA_HOLIDAYS_2026: string[] = [
  '01-01', // Año Nuevo
  '01-12', // Reyes Magos (trasladado)
  '03-23', // San José (trasladado)
  '03-29', // Domingo de Ramos — no es festivo laboral
  '04-02', // Jueves Santo
  '04-03', // Viernes Santo
  '05-18', // Ascensión del Señor (trasladado)
  '06-08', // Corpus Christi (trasladado)
  '06-15', // Sagrado Corazón (trasladado)
  '06-29', // San Pedro y San Pablo (trasladado)
  '07-20', // Independencia de Colombia
  '08-07', // Batalla de Boyacá
  '08-17', // Asunción de la Virgen (trasladado)
  '10-12', // Día de la Raza (trasladado)
  '11-02', // Todos los Santos (trasladado)
  '11-16', // Independencia de Cartagena (trasladado)
  '12-08', // Inmaculada Concepción
  '12-25', // Navidad
];

/**
 * Festivos en Colombia 2027.
 */
const COLOMBIA_HOLIDAYS_2027: string[] = [
  '01-01', // Año Nuevo
  '01-11', // Reyes Magos (trasladado)
  '03-22', // San José (trasladado)
  '03-25', // Jueves Santo
  '03-26', // Viernes Santo
  '05-17', // Ascensión del Señor (trasladado)
  '06-07', // Corpus Christi (trasladado)
  '06-14', // Sagrado Corazón (trasladado)
  '07-05', // San Pedro y San Pablo (trasladado)
  '07-20', // Independencia de Colombia
  '08-07', // Batalla de Boyacá
  '08-16', // Asunción de la Virgen (trasladado)
  '10-18', // Día de la Raza (trasladado)
  '11-01', // Todos los Santos
  '11-15', // Independencia de Cartagena (trasladado)
  '12-08', // Inmaculada Concepción
  '12-25', // Navidad
];

const HOLIDAYS_BY_YEAR: Record<string, string[]> = {
  '2026': COLOMBIA_HOLIDAYS_2026,
  '2027': COLOMBIA_HOLIDAYS_2027,
};

/**
 * Verifica si una fecha es festivo en Colombia.
 */
export function isColombianHoliday(date: Date): boolean {
  const year = date.getFullYear().toString();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const key = `${month}-${day}`;

  const holidays = HOLIDAYS_BY_YEAR[year];
  if (!holidays) return false;
  return holidays.includes(key);
}

/**
 * Verifica si una fecha es día laborable (lunes a viernes, no festivo).
 */
export function isBusinessDay(date: Date): boolean {
  const dayOfWeek = date.getDay(); // 0=domingo, 6=sábado
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return !isColombianHoliday(date);
}
