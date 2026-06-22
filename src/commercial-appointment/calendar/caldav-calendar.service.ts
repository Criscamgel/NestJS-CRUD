import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateCaldavIcsEvent, type IcsEventData } from '../utils/ics-generator.util';
import {
  extractCalendarDataBlocks,
  extractHrefValues,
  extractNestedHref,
} from './caldav-xml.util';
import { parseBusyIntervalsFromIcs, type BusyInterval } from './parse-ics-busy.util';

const PROPFIND_HEADERS = {
  Depth: '0',
  'Content-Type': 'application/xml; charset=utf-8',
};

const REPORT_HEADERS = {
  Depth: '1',
  'Content-Type': 'application/xml; charset=utf-8',
};

@Injectable()
export class CaldavCalendarService implements OnModuleInit {
  private readonly logger = new Logger(CaldavCalendarService.name);
  private cachedCalendarUrl: string | null | undefined;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.warn(
        'CalDAV deshabilitado: configure CALDAV_USERNAME y CALDAV_PASSWORD (y CALDAV_ENABLED=true).',
      );
      return;
    }

    const url = await this.getCalendarCollectionUrl();
    if (url) {
      this.logger.log(`CalDAV listo — calendario: ${url}`);
    } else {
      this.logger.error(
        'CalDAV habilitado pero no se pudo conectar al calendario. Revisa credenciales o CALDAV_CALENDAR_URL.',
      );
    }
  }

  isEnabled(): boolean {
    const enabled = this.readEnv('CALDAV_ENABLED')?.toLowerCase();
    if (enabled === 'false' || enabled === '0') return false;
    return Boolean(this.username && this.password);
  }

  /** Lee env directo (Dokploy) o clave camelCase del config loader. */
  private readEnv(key: string): string | undefined {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;

    const camelKey = key
      .toLowerCase()
      .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const fromConfig = this.configService.get<string>(key)?.trim()
      || this.configService.get<string>(camelKey)?.trim();
    return fromConfig || undefined;
  }

  private get serverUrl(): string {
    const raw = this.readEnv('CALDAV_SERVER_URL') || 'https://dav.privateemail.com';
    return raw.replace(/\/+$/, '');
  }

  private get username(): string {
    return (
      this.readEnv('CALDAV_USERNAME') ||
      this.readEnv('APPOINTMENT_INBOX') ||
      ''
    );
  }

  private get password(): string {
    return this.readEnv('CALDAV_PASSWORD') || '';
  }

  private get calendarUrlOverride(): string | undefined {
    const raw = this.readEnv('CALDAV_CALENDAR_URL');
    return raw ? raw.replace(/\/+$/, '') + '/' : undefined;
  }

  private get authHeader(): string {
    return `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
  }

  private async request(
    url: string,
    method: string,
    body?: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    return fetch(url, {
      method,
      headers: {
        Authorization: this.authHeader,
        ...extraHeaders,
      },
      body,
      redirect: 'follow',
    });
  }

  /** Obtiene la URL de la colección de calendario (con cache en memoria). */
  async getCalendarCollectionUrl(): Promise<string | null> {
    if (!this.isEnabled()) return null;
    if (this.calendarUrlOverride) return this.calendarUrlOverride;
    if (this.cachedCalendarUrl !== undefined) return this.cachedCalendarUrl;

    try {
      const discovered = await this.discoverCalendarCollectionUrl();
      this.cachedCalendarUrl = discovered;
      return discovered;
    } catch (error) {
      this.logger.error('CalDAV discovery failed', error);
      this.cachedCalendarUrl = null;
      return null;
    }
  }

  private async discoverCalendarCollectionUrl(): Promise<string | null> {
    const candidates = this.buildCalendarUrlCandidates();

    for (const candidate of candidates) {
      if (await this.verifyCalendarCollectionUrl(candidate)) {
        this.logger.log(`CalDAV calendar collection: ${candidate}`);
        return candidate;
      }
    }

    const viaWellKnown = await this.discoverViaWellKnown();
    if (viaWellKnown && (await this.verifyCalendarCollectionUrl(viaWellKnown))) {
      this.logger.log(`CalDAV calendar collection (well-known): ${viaWellKnown}`);
      return viaWellKnown;
    }

    this.logger.warn(
      `CalDAV: no se encontró calendario. Candidatos probados: ${candidates.join(', ')}`,
    );
    return null;
  }

  private buildCalendarUrlCandidates(): string[] {
    const email = this.username;
    const encodedEmail = encodeURIComponent(email);
    const localPart = email.split('@')[0] ?? email;

    const candidates = [
      this.calendarUrlOverride,
      `${this.serverUrl}/caldav/${encodedEmail}/calendar/`,
      `${this.serverUrl}/caldav/${encodedEmail}/`,
      `${this.serverUrl}/caldav/${localPart}/calendar/`,
      `${this.serverUrl}/dav/${encodedEmail}/calendar/`,
    ].filter(Boolean) as string[];

    return [...new Set(candidates)];
  }

  private async verifyCalendarCollectionUrl(url: string): Promise<boolean> {
    const propfind = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
  </D:prop>
</D:propfind>`;

    const res = await this.request(url, 'PROPFIND', propfind, PROPFIND_HEADERS);
    if (res.status !== 207 && !res.ok) return false;

    const xml = await res.text();
    const isCalendar =
      /<(?:[A-Za-z0-9]+:)?calendar\s*\/?>/i.test(xml) ||
      xml.toLowerCase().includes('calendar');

    return isCalendar;
  }

  private async resolvePrincipalUrl(startUrl: string): Promise<string | null> {
    const propfind = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`;

    const res = await this.request(startUrl, 'PROPFIND', propfind, PROPFIND_HEADERS);
    if (res.status !== 207 && !res.ok) {
      const fallback = await this.request(this.serverUrl, 'PROPFIND', propfind, PROPFIND_HEADERS);
      if (fallback.status !== 207 && !fallback.ok) return null;
      const xml = await fallback.text();
      const href = extractNestedHref(xml, 'current-user-principal');
      return href ? this.toAbsoluteUrl(href) : null;
    }

    const xml = await res.text();
    const href = extractNestedHref(xml, 'current-user-principal');
    return href ? this.toAbsoluteUrl(href) : null;
  }

  private async fetchCalendarHomeSet(principalUrl: string): Promise<string | null> {
    const propfind = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
  </D:prop>
</D:propfind>`;

    const res = await this.request(principalUrl, 'PROPFIND', propfind, PROPFIND_HEADERS);
    if (res.status !== 207 && !res.ok) return null;

    const xml = await res.text();
    const href = extractNestedHref(xml, 'calendar-home-set');
    return href ? this.toAbsoluteUrl(href) : null;
  }

  private async listCalendarCollections(homeSetUrl: string): Promise<string[]> {
    const propfind = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
  </D:prop>
</D:propfind>`;

    const res = await this.request(homeSetUrl, 'PROPFIND', propfind, {
      ...PROPFIND_HEADERS,
      Depth: '1',
    });
    if (res.status !== 207 && !res.ok) return [];

    const xml = await res.text();
    const hrefs = extractHrefValues(xml);
    const normalizedHome = homeSetUrl.replace(/\/+$/, '');

    return hrefs.filter((href) => {
      const absolute = this.toAbsoluteUrl(href).replace(/\/+$/, '');
      return absolute !== normalizedHome;
    });
  }

  private async discoverViaWellKnown(): Promise<string | null> {
    const wellKnown = `${this.serverUrl}/.well-known/caldav`;
    const principalUrl = await this.resolvePrincipalUrl(wellKnown);
    if (!principalUrl) return null;

    const homeSet = await this.fetchCalendarHomeSet(principalUrl);
    if (!homeSet) return null;

    const calendars = await this.listCalendarCollections(homeSet);
    if (calendars.length === 0) return null;

    const preferredName = this.readEnv('CALDAV_CALENDAR_NAME')?.toLowerCase() || '';
    if (preferredName) {
      const match = calendars.find((c) => c.toLowerCase().includes(preferredName));
      if (match) return this.toAbsoluteUrl(match).replace(/\/?$/, '/');
    }

    return this.toAbsoluteUrl(calendars[0]).replace(/\/?$/, '/');
  }

  /** Consulta eventos ocupados en un rango de fechas (inclusive). */
  async fetchBusyIntervals(fromDate: string, toDate: string): Promise<BusyInterval[]> {
    if (!this.isEnabled()) return [];

    const calendarUrl = await this.getCalendarCollectionUrl();
    if (!calendarUrl) return [];

    const timeRangeStart = `${fromDate.replace(/-/g, '')}T000000Z`;
    const timeRangeEnd = `${toDate.replace(/-/g, '')}T235959Z`;

    const report = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${timeRangeStart}" end="${timeRangeEnd}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    try {
      const res = await this.request(calendarUrl, 'REPORT', report, REPORT_HEADERS);
      if (res.status !== 207 && !res.ok) {
        this.logger.warn(`CalDAV REPORT failed: HTTP ${res.status}`);
        return [];
      }

      const xml = await res.text();
      const blocks = extractCalendarDataBlocks(xml);
      const intervals: BusyInterval[] = [];
      for (const block of blocks) {
        intervals.push(...parseBusyIntervalsFromIcs(block));
      }
      return intervals;
    } catch (error) {
      this.logger.error('CalDAV fetchBusyIntervals failed', error);
      return [];
    }
  }

  /** Crea un evento en el calendario. Devuelve la URL del recurso .ics. */
  async createEvent(data: IcsEventData): Promise<string | null> {
    if (!this.isEnabled()) {
      this.logger.warn('CalDAV createEvent omitido: integración deshabilitada');
      return null;
    }

    const calendarUrl = await this.getCalendarCollectionUrl();
    if (!calendarUrl) return null;

    const icsBody = generateCaldavIcsEvent(data);
    const filename = `${data.uid.replace(/[^a-zA-Z0-9@._-]/g, '_')}.ics`;
    const eventUrl = `${calendarUrl}${filename}`;

    try {
      const res = await this.request(eventUrl, 'PUT', icsBody, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'If-None-Match': '*',
      });

      if (res.status === 200 || res.status === 201 || res.status === 204) {
        this.logger.log(`CalDAV event created: ${eventUrl}`);
        return eventUrl;
      }

      const body = await res.text();
      this.logger.error(`CalDAV PUT failed: HTTP ${res.status} — ${body.slice(0, 500)}`);
      return null;
    } catch (error) {
      this.logger.error('CalDAV createEvent failed', error);
      return null;
    }
  }

  /** Elimina un evento previamente creado. */
  async deleteEvent(eventUrl: string): Promise<boolean> {
    if (!this.isEnabled() || !eventUrl) return false;

    try {
      const res = await this.request(eventUrl, 'DELETE');
      if (res.status === 204 || res.status === 200 || res.status === 404) {
        this.logger.log(`CalDAV event deleted: ${eventUrl}`);
        return true;
      }
      this.logger.warn(`CalDAV DELETE failed: HTTP ${res.status}`);
      return false;
    } catch (error) {
      this.logger.error('CalDAV deleteEvent failed', error);
      return false;
    }
  }

  private toAbsoluteUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (pathOrUrl.startsWith('/')) return `${this.serverUrl}${pathOrUrl}`;
    return `${this.serverUrl}/${pathOrUrl}`;
  }
}
