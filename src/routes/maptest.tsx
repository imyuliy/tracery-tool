// Minimale MapLibre-test: puur OSM raster-tiles, geen data, geen overlays.
// Doel: bevestigen dat MapLibre überhaupt iets rendert in deze build.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export const Route = createFileRoute("/maptest")({
  component: MapTestPage,
});

function MapTestPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [status, setStatus] = useState<string>("init…");
  const [tileEvents, setTileEvents] = useState<{ loaded: number; errors: number }>({
    loaded: 0,
    errors: 0,
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    setStatus("creating map");

    let loaded = 0;
    let errors = 0;

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [
                "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
            pdok_brt: {
              type: "raster",
              tiles: [
                "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{y}/{x}.png",
              ],
              tileSize: 256,
              attribution: "© Kadaster (PDOK BRT)",
            },
          },
          layers: [
            { id: "osm", type: "raster", source: "osm" },
            {
              id: "pdok_brt",
              type: "raster",
              source: "pdok_brt",
              paint: { "raster-opacity": 0.6 },
            },
          ],
        },
        center: [4.535, 52.17], // Warmond/Leiden — past bij je KML
        zoom: 13,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("load", () => setStatus("loaded"));
      map.on("error", (e) => {
        // eslint-disable-next-line no-console
        console.error("[maptest] map error:", e);
        setStatus(`error: ${e.error?.message ?? "unknown"}`);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("data", (e: any) => {
        if (e.dataType === "source" && e.tile) {
          loaded += 1;
          setTileEvents({ loaded, errors });
        }
      });

      mapRef.current = map;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[maptest] init threw:", err);
      setStatus(`throw: ${(err as Error).message}`);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-md bg-white/90 px-3 py-2 font-mono text-xs shadow-md">
        <div>status: {status}</div>
        <div>tiles loaded: {tileEvents.loaded}</div>
        <div>tile errors: {tileEvents.errors}</div>
      </div>
    </div>
  );
}
