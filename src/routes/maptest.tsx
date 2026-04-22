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
    const node = containerRef.current;
    if (!node || mapRef.current) return;
    setStatus("creating map");

    let loaded = 0;
    let errors = 0;
    let ro: ResizeObserver | null = null;

    try {
      const map = new maplibregl.Map({
        container: node,
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
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [4.535, 52.17], // Warmond/Leiden
        zoom: 13,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("load", () => {
        setStatus("loaded");
        // Force resize na load — vangt container-size=0-bug af
        setTimeout(() => map.resize(), 0);
        setTimeout(() => map.resize(), 200);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("error", (e: any) => {
        if (e?.tile) {
          errors += 1;
          setTileEvents({ loaded, errors });
        } else {
          // eslint-disable-next-line no-console
          console.error("[maptest] map error:", e);
          setStatus(`error: ${e?.error?.message ?? "unknown"}`);
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("data", (e: any) => {
        if (e.dataType === "source" && e.tile) {
          loaded += 1;
          setTileEvents({ loaded, errors });
        }
      });

      ro = new ResizeObserver(() => map.resize());
      ro.observe(node);

      mapRef.current = map;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[maptest] init threw:", err);
      setStatus(`throw: ${(err as Error).message}`);
    }

    return () => {
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", background: "#ddd" }}
      />
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          background: "rgba(255,255,255,0.9)",
          padding: "8px 12px",
          fontFamily: "monospace",
          fontSize: 12,
          borderRadius: 6,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          pointerEvents: "none",
        }}
      >
        <div>status: {status}</div>
        <div>tiles loaded: {tileEvents.loaded}</div>
        <div>tile errors: {tileEvents.errors}</div>
      </div>
    </div>
  );
}
