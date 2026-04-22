// Lichte KML-parser: extraheert alle <LineString>/<coordinates> en bouwt
// een MultiLineString WKT in EPSG:4326.
//
// KML-coordinates zijn altijd "lon,lat[,alt] lon,lat[,alt] ..." (WGS84).
// We negeren altitude (alt) — voor traceringen 2D voldoende.

export interface KmlParseResult {
  wkt: string; // MULTILINESTRING((lon lat, lon lat),(lon lat, lon lat))
  lineCount: number;
  pointCount: number;
}

export function parseKmlToMultiLineStringWkt(text: string): KmlParseResult {
  // Strip XML-comments om regex-rommel te voorkomen.
  const stripped = text.replace(/<!--[\s\S]*?-->/g, "");

  // Match elke <coordinates>...</coordinates> binnen een <LineString>.
  const re =
    /<LineString[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/g;

  const lines: string[] = [];
  let pointCount = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    // Coordinaten gescheiden door whitespace (newlines, spaces).
    const tuples = raw.split(/\s+/).filter(Boolean);
    const pts: string[] = [];
    for (const t of tuples) {
      const parts = t.split(",");
      if (parts.length < 2) continue;
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      pts.push(`${lon} ${lat}`);
    }
    if (pts.length < 2) continue; // LineString eist minimaal 2 punten
    lines.push(`(${pts.join(", ")})`);
    pointCount += pts.length;
  }

  if (lines.length === 0) {
    throw new Error("Geen LineString-geometrieën gevonden in KML.");
  }

  return {
    wkt: `MULTILINESTRING(${lines.join(", ")})`,
    lineCount: lines.length,
    pointCount,
  };
}
