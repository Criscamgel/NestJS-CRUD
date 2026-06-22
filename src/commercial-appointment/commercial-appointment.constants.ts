/** Horario comercial de citas — hora Colombia. Fijo en código (no .env). */
export const COMMERCIAL_APPOINTMENT_SCHEDULE = {
  startHour: '09:00',
  endHour: '18:00',
  slotDurationMinutes: 60,
  allowedDurations: [60] as number[],
  timezone: 'America/Bogota',
  availableDays: [1, 2, 3, 4, 5] as number[],
  maxAdvanceDays: 30,
} as const;
