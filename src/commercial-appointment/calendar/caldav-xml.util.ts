/** Extrae el primer valor de una propiedad XML (namespace-agnostic). */
export function extractXmlValue(xml: string, tagName: string): string | null {
  const regex = new RegExp(
    `<(?:[A-Za-z0-9]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9]+:)?${tagName}>`,
    'i',
  );
  const match = xml.match(regex);
  if (!match?.[1]) return null;
  return decodeXmlEntities(match[1].trim());
}

/** Extrae todos los href de un multistatus CalDAV/WebDAV. */
export function extractHrefValues(xml: string): string[] {
  const regex = /<(?:[A-Za-z0-9]+:)?href[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?href>/gi;
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const href = decodeXmlEntities(match[1].trim());
    if (href) hrefs.push(href);
  }
  return hrefs;
}

/** Extrae bloques calendar-data de una respuesta REPORT. */
export function extractCalendarDataBlocks(xml: string): string[] {
  const regex =
    /<(?:[A-Za-z0-9]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?calendar-data>/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(decodeXmlEntities(match[1].trim()));
  }
  return blocks;
}

/** Extrae href anidado dentro de un tag padre (p. ej. current-user-principal). */
export function extractNestedHref(xml: string, parentTag: string): string | null {
  const parentRegex = new RegExp(
    `<(?:[A-Za-z0-9]+:)?${parentTag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9]+:)?${parentTag}>`,
    'i',
  );
  const parentMatch = xml.match(parentRegex);
  if (!parentMatch?.[1]) return null;
  return extractXmlValue(parentMatch[1], 'href');
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
