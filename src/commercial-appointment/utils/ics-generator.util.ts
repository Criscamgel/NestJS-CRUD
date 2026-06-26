/**
 * Genera un archivo .ics (iCalendar) como string para adjuntar en emails.
 * Convierte hora Colombia (UTC-5) a UTC para DTSTART/DTEND.
 */

export interface IcsEventData {
  /** Fecha YYYY-MM-DD */
  date: string;
  /** Hora inicio HH:mm (hora Colombia) */
  startTime: string;
  /** Duración en minutos */
  duration: number;
  /** Resumen/título del evento */
  summary: string;
  /** Descripción del evento */
  description: string;
  /** URL de la reunión */
  location: string;
  /** Email del organizador */
  organizerEmail: string;
  /** Nombre del organizador */
  organizerName: string;
  /** Email del asistente */
  attendeeEmail: string;
  /** Nombre del asistente */
  attendeeName: string;
  /** ID único del evento */
  uid: string;
}

/**
 * Convierte fecha + hora Colombia a formato UTC iCalendar (YYYYMMDDTHHmmssZ).
 * Colombia = UTC-5 (no tiene horario de verano).
 */
function toUtcIcsDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);

  // Crear fecha en UTC sumando 5 horas (Colombia es UTC-5)
  const utcDate = new Date(
    Date.UTC(year, month - 1, day, hours + 5, minutes, 0),
  );

  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getUTCDate()).padStart(2, '0');
  const h = String(utcDate.getUTCHours()).padStart(2, '0');
  const min = String(utcDate.getUTCMinutes()).padStart(2, '0');
  const s = '00';

  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function nowUtcIcs(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function toLocalIcsDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-');
  const [hours, minutes] = time.split(':');
  return `${year}${month}${day}T${hours}${minutes}00`;
}

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** ICS para CalDAV (Open-Xchange / Namecheap) con TZID Colombia. */
export function generateCaldavIcsEvent(data: IcsEventData): string {
  const endTime = addMinutes(data.startTime, data.duration);
  const dtStart = toLocalIcsDateTime(data.date, data.startTime);
  const dtEnd = toLocalIcsDateTime(data.date, endTime);
  const dtstamp = nowUtcIcs();

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cheky//CommercialAppointments//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    'TZID:America/Bogota',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0500',
    'TZNAME:COT',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${data.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=America/Bogota:${dtStart}`,
    `DTEND;TZID=America/Bogota:${dtEnd}`,
    `SUMMARY:${escapeIcsText(data.summary)}`,
    `DESCRIPTION:${escapeIcsText(data.description)}`,
    `LOCATION:${escapeIcsText(data.location)}`,
    `ORGANIZER;CN=${escapeIcsText(data.organizerName)}:mailto:${data.organizerEmail}`,
    `ATTENDEE;CN=${escapeIcsText(data.attendeeName)};RSVP=TRUE:mailto:${data.attendeeEmail}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reunion comercial con Cheky en 15 minutos',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function generateIcsEvent(data: IcsEventData): string {
  const endTime = addMinutes(data.startTime, data.duration);
  const dtStart = toUtcIcsDateTime(data.date, data.startTime);
  const dtEnd = toUtcIcsDateTime(data.date, endTime);
  const dtstamp = nowUtcIcs();

  // Escapar caracteres especiales en texto
  const escapeIcs = escapeIcsText;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cheky//CommercialAppointments//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${data.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(data.summary)}`,
    `DESCRIPTION:${escapeIcs(data.description)}`,
    `LOCATION:${escapeIcs(data.location)}`,
    `ORGANIZER;CN=${escapeIcs(data.organizerName)}:mailto:${data.organizerEmail}`,
    `ATTENDEE;CN=${escapeIcs(data.attendeeName)};RSVP=TRUE:mailto:${data.attendeeEmail}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reunión comercial con Cheky en 15 minutos',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
