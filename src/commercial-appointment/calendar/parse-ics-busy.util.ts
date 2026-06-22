export type BusyInterval = {
  date: string;
  startMinutes: number;
  endMinutes: number;
};

type ParsedDateTime = {
  date: string;
  minutes: number;
};

/** Convierte minutos UTC a fecha/hora en Colombia (UTC-5, sin DST). */
function utcToColombia(utc: Date): ParsedDateTime {
  const colombiaMs = utc.getTime() - 5 * 60 * 60 * 1000;
  const d = new Date(colombiaMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  return {
    date: `${year}-${month}-${day}`,
    minutes: hours * 60 + minutes,
  };
}

function parseIcsDateTimeValue(raw: string): ParsedDateTime | null {
  const value = raw.trim();
  if (!value) return null;

  if (value.endsWith('Z')) {
    const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (!match) return null;
    const [, y, mo, d, h, mi] = match;
    const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, 0));
    return utcToColombia(utc);
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  return {
    date: `${y}-${mo}-${d}`,
    minutes: +h * 60 + +mi,
  };
}

function extractProperty(block: string, name: string): string | null {
  const regex = new RegExp(`^${name}(?:;[^:]*)?:(.+)$`, 'im');
  const match = block.match(regex);
  return match?.[1]?.trim() ?? null;
}

function unfoldIcs(content: string): string {
  return content.replace(/\r?\n[ \t]/g, '');
}

/**
 * Extrae intervalos ocupados de un bloque ICS (uno o varios VEVENT).
 * Ignora eventos cancelados.
 */
export function parseBusyIntervalsFromIcs(icsContent: string): BusyInterval[] {
  const unfolded = unfoldIcs(icsContent);
  const events = unfolded.split('BEGIN:VEVENT').slice(1);
  const intervals: BusyInterval[] = [];

  for (const chunk of events) {
    const block = `BEGIN:VEVENT${chunk}`;
    const status = extractProperty(block, 'STATUS');
    if (status?.toUpperCase() === 'CANCELLED') continue;

    const dtStartRaw = extractProperty(block, 'DTSTART');
    const dtEndRaw = extractProperty(block, 'DTEND');
    if (!dtStartRaw || !dtEndRaw) continue;

    const start = parseIcsDateTimeValue(dtStartRaw);
    const end = parseIcsDateTimeValue(dtEndRaw);
    if (!start || !end) continue;

    if (start.date === end.date) {
      intervals.push({
        date: start.date,
        startMinutes: start.minutes,
        endMinutes: end.minutes,
      });
      continue;
    }

    // Evento cruza medianoche: bloquear desde inicio hasta fin de día y el día siguiente hasta end
    intervals.push({
      date: start.date,
      startMinutes: start.minutes,
      endMinutes: 24 * 60,
    });
    intervals.push({
      date: end.date,
      startMinutes: 0,
      endMinutes: end.minutes,
    });
  }

  return intervals;
}
