// KML-parser voor Liander-design-exports.
//
// Liander-KMLs bevatten meerdere <Folder>s, elk met tientallen <Placemark>s
// die samen één tracé vormen. Voorbeeld:
//   - WTAP_PLAN_E_MS_BUIS    (mantelbuis)
//   - WTAP_PLAN_E_10kV_NET   (10kV-kabelnet — feitelijk MS-tracé)
//   - WTAP_PLAN_E_LS_NET     (LS-net)
//
// Strategie:
// 1. Parse alle <Folder>s en groepeer placemarks/linestrings per folder.
// 2. Kies de "primaire" folder volgens prioriteit (kabelnet > buis > overig).
// 3. Merge alle LineStrings in die folder tot één MultiLineString WKT.
// 4. Geef ook de andere folders terug als 'available_layers' voor diagnose.
//
// KML-coordinates: "lon,lat[,alt] lon,lat[,alt] ..." in WGS84 (EPSG:4326).
// Altitude wordt genegeerd — 2D voor traceringen.

export interface KmlLayer {
  name: string;
  lineCount: number;
  pointCount: number;
  wkt: string; // MULTILINESTRING(...)
}

export interface KmlParseResult {
  wkt: string; // gekozen primaire layer
  lineCount: number;
  pointCount: number;
  chosenLayer: string;
  availableLayers: KmlLayer[]; // alle gevonden lagen, voor diagnose / latere keuze
}

// Folder-prioriteit: hoger = liever. Liander-conventie.
const FOLDER_PRIORITY: Array<{ pattern: RegExp; score: number; reason: string }> = [
  { pattern: /10\s*kv.*net|ms.*net|mskabel|10kvkabel/i, score: 100, reason: "MS-kabelnet" },
  { pattern: /20\s*kv|hs.*net/i, score: 90, reason: "HS-kabelnet" },
  { pattern: /ls.*net|laagspanning/i, score: 70, reason: "LS-kabelnet" },
  { pattern: /ms.*buis|mantelbuis|buis/i, score: 50, reason: "Mantelbuis" },
  { pattern: /trace|tracé/i, score: 40, reason: "Tracé" },
];

function scoreFolder(name: string): number {
  for (const p of FOLDER_PRIORITY) {
    if (p.pattern.test(name)) return p.score;
  }
  return 10; // onbekende folder → laag
}

interface ParsedLineString {
  wktInner: string; // "(lon lat, lon lat, ...)"
  pointCount: number;
}

function parseCoordinatesBlock(raw: string): ParsedLineString | null {
  const tuples = raw.trim().split(/\s+/).filter(Boolean);
  const pts: string[] = [];
  for (const t of tuples) {
    const parts = t.split(",");
    if (parts.length < 2) continue;
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    pts.push(`${lon} ${lat}`);
  }
  if (pts.length < 2) return null;
  return { wktInner: `(${pts.join(", ")})`, pointCount: pts.length };
}

function extractLineStringsFrom(xml: string): ParsedLineString[] {
  const re =
    /<LineString[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/g;
  const out: ParsedLineString[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const parsed = parseCoordinatesBlock(m[1]);
    if (parsed) out.push(parsed);
  }
  return out;
}

// Vind alle <Folder>...</Folder>-blokken op top-niveau (niet-recursief volstaat
// voor Liander-exports — die hebben platte folder-structuur). Als er geen
// <Folder>s zijn, retourneren we de hele KML als één impliciete "root"-laag.
function extractFolders(xml: string): Array<{ name: string; xml: string }> {
  const folderRe = /<Folder[^>]*>([\s\S]*?)<\/Folder>/g;
  const folders: Array<{ name: string; xml: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = folderRe.exec(xml)) !== null) {
    const inner = m[1];
    const nameMatch = inner.match(/<name>\s*([\s\S]*?)\s*<\/name>/);
    const name = nameMatch ? nameMatch[1].trim() : "Folder";
    folders.push({ name, xml: inner });
  }
  return folders;
}

export function parseKmlToMultiLineStringWkt(text: string): KmlParseResult {
  // Strip XML-comments + CDATA-wrappers.
  const stripped = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

  const folders = extractFolders(stripped);

  // Bouw layers op. Als er folders zijn: elk wordt een laag. Anders: één
  // implicit "root"-laag met alle LineStrings.
  const layers: KmlLayer[] = [];
  if (folders.length > 0) {
    for (const f of folders) {
      const lines = extractLineStringsFrom(f.xml);
      if (lines.length === 0) continue;
      const pointCount = lines.reduce((a, b) => a + b.pointCount, 0);
      layers.push({
        name: f.name,
        lineCount: lines.length,
        pointCount,
        wkt: `MULTILINESTRING(${lines.map((l) => l.wktInner).join(", ")})`,
      });
    }
  }
  // Fallback / aanvulling: als folders 0 LineStrings opleverden, of geen
  // folders bestaan, gebruik álle LineStrings in het document.
  if (layers.length === 0) {
    const allLines = extractLineStringsFrom(stripped);
    if (allLines.length === 0) {
      throw new Error("Geen LineString-geometrieën gevonden in KML.");
    }
    const pointCount = allLines.reduce((a, b) => a + b.pointCount, 0);
    layers.push({
      name: "(root)",
      lineCount: allLines.length,
      pointCount,
      wkt: `MULTILINESTRING(${allLines.map((l) => l.wktInner).join(", ")})`,
    });
  }

  // Plat alles tot ÉÉN MultiLineString — alle LineStrings uit alle folders
  // samen. Geen folder-prioriteit meer; we behandelen het tracé als geheel.
  // Dit voorkomt dat we per ongeluk alleen de mantelbuis óf alleen het
  // kabelnet pakken — de gebruiker krijgt altijd alle lijnen te zien.
  const allLines = extractLineStringsFrom(stripped);
  if (allLines.length === 0) {
    throw new Error("Geen LineString-geometrieën gevonden in KML.");
  }
  const totalPoints = allLines.reduce((a, b) => a + b.pointCount, 0);
  const flatWkt = `MULTILINESTRING(${allLines.map((l) => l.wktInner).join(", ")})`;

  return {
    wkt: flatWkt,
    lineCount: allLines.length,
    pointCount: totalPoints,
    chosenLayer: layers.length > 1 ? `${layers.length} lagen samengevoegd` : layers[0].name,
    availableLayers: layers,
  };
}
