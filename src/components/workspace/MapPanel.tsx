import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MlMap, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BGT_COLORS,
  BGT_LABELS,
  TRACE_COLOR,
  TRACE_OUTLINE_COLOR,
  type useTraceMapData,
} from "@/lib/workspace";

type MapData = NonNullable<ReturnType<typeof useTraceMapData>["data"]>;

const PDOK_BRT =
  "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png";
const PDOK_BGT =
  "https://service.pdok.nl/lv/bgt/wmts/v1_0/achtergrondvisualisatie/EPSG:3857/{z}/{x}/{y}.png";

// match-expression voor BGT segment kleuren
function bgtColorMatch(): maplibregl.ExpressionSpecification {
  const expr: unknown[] = ["match", ["get", "bgt_feature_type"]];
  for (const [k, v] of Object.entries(BGT_COLORS)) {
    if (k === "default") continue;
    expr.push(k, v);
  }
  expr.push(BGT_COLORS.default);
  return expr as maplibregl.ExpressionSpecification;
}

export interface MapPanelProps {
  data: MapData | undefined;
  isLoading: boolean;
  highlightedLokaalId: string | null;
  onSegmentClick: (props: {
    bgt_lokaal_id: string;
    bgt_feature_type: string;
    bgt_type: string;
    sequence: number;
    length_m: number;
  }) => void;
}

export function MapPanel({
  data,
  isLoading,
  highlightedLokaalId,
  onSegmentClick,
}: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [bgtVisible, setBgtVisible] = useState(true);
  const [ready, setReady] = useState(false);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          brt: {
            type: "raster",
            tiles: [PDOK_BRT],
            tileSize: 256,
            attribution: "© Kadaster (PDOK BRT)",
          },
          bgt: {
            type: "raster",
            tiles: [PDOK_BGT],
            tileSize: 256,
            attribution: "© Kadaster (BGT)",
          },
        },
        layers: [
          { id: "brt", type: "raster", source: "brt" },
          {
            id: "bgt",
            type: "raster",
            source: "bgt",
            paint: { "raster-opacity": 0.4 },
          },
        ],
        glyphs: undefined,
      },
      center: [5.1214, 52.0907], // NL fallback (Utrecht)
      zoom: 7,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => setReady(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle BGT layer visibility.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    if (m.getLayer("bgt")) {
      m.setLayoutProperty("bgt", "visibility", bgtVisible ? "visible" : "none");
    }
  }, [bgtVisible, ready]);

  // Sync data → sources & layers.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !data) return;

    const setOrAdd = (id: string, geo: GeoJSON.Feature | GeoJSON.FeatureCollection) => {
      const src = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(geo as never);
      else m.addSource(id, { type: "geojson", data: geo as never });
    };

    if (data.segments_geojson) setOrAdd("segments", data.segments_geojson);
    if (data.trace_geojson) setOrAdd("trace", data.trace_geojson);
    if (data.stations_geojson) setOrAdd("stations", data.stations_geojson);

    if (!m.getLayer("segments-line")) {
      m.addLayer({
        id: "segments-line",
        type: "line",
        source: "segments",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": bgtColorMatch(),
          "line-width": [
            "case",
            ["==", ["get", "bgt_lokaal_id"], highlightedLokaalId ?? ""],
            8,
            5,
          ],
          "line-opacity": 0.85,
        },
      });
      m.on("mouseenter", "segments-line", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "segments-line", () => {
        m.getCanvas().style.cursor = "";
      });
      m.on("click", "segments-line", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, unknown>;
        onSegmentClick({
          bgt_lokaal_id: String(p.bgt_lokaal_id ?? ""),
          bgt_feature_type: String(p.bgt_feature_type ?? ""),
          bgt_type: String(p.bgt_type ?? ""),
          sequence: Number(p.sequence ?? 0),
          length_m: Number(p.length_m ?? 0),
        });
      });
    }

    if (!m.getLayer("trace-outline")) {
      m.addLayer({
        id: "trace-outline",
        type: "line",
        source: "trace",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": TRACE_OUTLINE_COLOR,
          "line-width": 8,
          "line-opacity": 0.95,
        },
      });
    }
    if (!m.getLayer("trace-line")) {
      m.addLayer({
        id: "trace-line",
        type: "line",
        source: "trace",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": TRACE_COLOR,
          "line-width": 4,
          "line-opacity": 1,
        },
      });
    }

    if (!m.getLayer("stations-circle")) {
      m.addLayer({
        id: "stations-circle",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": 8,
          "circle-color": "#0F1613",
          "circle-stroke-color": "#EDE7DA",
          "circle-stroke-width": 3,
        },
      });
    }

    // Fit to bbox.
    const bbox = data.bbox_4326;
    if (bbox?.coordinates?.[0]) {
      const ring = bbox.coordinates[0] as number[][];
      const lngs = ring.map((p) => p[0]);
      const lats = ring.map((p) => p[1]);
      const bounds: LngLatBoundsLike = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ];
      m.fitBounds(bounds, { padding: 50, duration: 600, maxZoom: 18 });
    }
  }, [data, ready, highlightedLokaalId, onSegmentClick]);

  // Update highlight paint when highlightedLokaalId changes.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !m.getLayer("segments-line")) return;
    m.setPaintProperty("segments-line", "line-width", [
      "case",
      ["==", ["get", "bgt_lokaal_id"], highlightedLokaalId ?? ""],
      9,
      4,
    ]);
  }, [highlightedLokaalId, ready]);

  return (
    <div className="relative h-full w-full bg-bone">
      <div ref={containerRef} className="absolute inset-0" />
      {/* BGT toggle — bottom-center floating */}
      <div className="pointer-events-none absolute bottom-[280px] left-1/2 z-[5] -translate-x-1/2">
        <Button
          type="button"
          size="sm"
          variant="glass"
          onClick={() => setBgtVisible((v) => !v)}
          className={`pointer-events-auto gap-1.5 ${bgtVisible ? "border-blood/60 text-blood" : ""}`}
        >
          <Layers className="h-3.5 w-3.5" />
          BGT-overlay {bgtVisible ? "aan" : "uit"}
        </Button>
      </div>
      {/* BGT legend — bottom-left, glass */}
      {data && data.segments_geojson?.features?.length ? (
        <div className="pointer-events-none absolute bottom-[280px] left-4 z-[5]">
          <div className="glass pointer-events-auto rounded-md px-3 py-2 shadow-xl shadow-ink/10">
            <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-ink/60">
              BGT
            </p>
            <ul className="space-y-1">
              {Object.entries(BGT_LABELS)
                .filter(([k]) => k !== "scheiding_vlak")
                .map(([key, label]) => (
                  <li
                    key={key}
                    className="flex items-center gap-2 font-sans text-[11px] text-ink"
                  >
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 rounded-sm border border-ink/20"
                      style={{ backgroundColor: BGT_COLORS[key] }}
                    />
                    {label}
                  </li>
                ))}
              <li className="mt-1.5 flex items-center gap-2 border-t border-border pt-1.5 font-sans text-[11px] text-ink">
                <span
                  aria-hidden
                  className="inline-block h-1 w-3 rounded-full"
                  style={{
                    backgroundColor: TRACE_COLOR,
                    boxShadow: `0 0 0 1px ${TRACE_OUTLINE_COLOR}`,
                  }}
                />
                Tracé
              </li>
            </ul>
          </div>
        </div>
      ) : null}
      {(isLoading || !data) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-paper/60 backdrop-blur-sm">
          <div className="glass-strong rounded-md px-5 py-3 font-mono text-xs uppercase tracking-wider text-ink shadow-xl">
            {isLoading ? "Kaart laden…" : "Nog geen tracé. Upload er een via het linker paneel."}
          </div>
        </div>
      )}
    </div>
  );
}
