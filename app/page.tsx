"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { supabase } from "@/lib/supabaseClient";

mapboxgl.accessToken =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";


type EventRow = {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  address: string | null;
  lat: number;
  lng: number;
};

type Filter = "all" | "today" | "weekend";

function parseDate(s: string) {
  return new Date(s);
}

function isToday(iso: string) {
  const d = parseDate(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isWeekend(iso: string) {
  const d = parseDate(iso);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  return day === 5 || day === 6 || day === 0; // Fri/Sat/Sun
}

export default function Home() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Data
  const [allEvents, setAllEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter (persisted)
  const [filter, setFilter] = useState<Filter>("all");
  const [filterReady, setFilterReady] = useState(false);

  // Bottom sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetState, setSheetState] = useState<"peek" | "full">("peek");
  const [sheetTitle, setSheetTitle] = useState("Upcoming events");
  const [sheetItems, setSheetItems] = useState<EventRow[]>([]);

  // Selection (A feature)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;
  if (!selectedEventId) return;
  if (!map.getLayer("selected-event")) return;

  let up = true;
  const id = window.setInterval(() => {
    const next = up ? 13 : 11;
    up = !up;
    try {
      map.setPaintProperty("selected-event", "circle-radius", next);
    } catch {}
  }, 650);

  return () => window.clearInterval(id);
}, [selectedEventId]);

  // Mapbox token
  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  }, []);

useEffect(() => {
  mapRef.current?.resize();
}, [sheetOpen, sheetState]);
  // Load saved filter
  useEffect(() => {
    try {
      const saved = localStorage.getItem("turku_events_filter") as Filter | null;
      if (saved === "all" || saved === "today" || saved === "weekend") {
        setFilter(saved);
      }
    } catch {}
    setFilterReady(true);
  }, []);

  // Save filter
  useEffect(() => {
    if (!filterReady) return;
    try {
      localStorage.setItem("turku_events_filter", filter);
    } catch {}
  }, [filter, filterReady]);

  // Filtering
  const isInFilter = (iso: string) => {
    if (filter === "all") return true;
    if (filter === "today") return isToday(iso);
    return isWeekend(iso);
  };

  const filteredEvents = useMemo(() => {
    return allEvents.filter((e) => e.start_time && isInFilter(e.start_time));
  }, [allEvents, filter]);

  // Counts
  const allCount = allEvents.length;
  const todayCount = allEvents.filter((e) => e.start_time && isToday(e.start_time)).length;
  const weekendCount = allEvents.filter((e) => e.start_time && isWeekend(e.start_time)).length;

  // Empty state label
  const emptyLabel =
    filter === "today"
      ? "No events today"
      : filter === "weekend"
      ? "No events this weekend"
      : "No events yet";

  // Helper: build geojson for map
  const toGeoJSON = (rows: EventRow[]) => {
    return {
      type: "FeatureCollection" as const,
      features: rows.map((e) => ({
        type: "Feature" as const,
        properties: {
          id: e.id,
          title: e.title,
          start_time: e.start_time,
          address: e.address,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [e.lng, e.lat],
        },
      })),
    };
  };

  // Fetch events once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_time", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error(error.message);
        setAllEvents([]);
        setLoading(false);
        return;
      }

      setAllEvents((data ?? []) as EventRow[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Init Mapbox ONCE
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",

      center: [22.2666, 60.4518],
      zoom: 12,
    });

    mapRef.current = map;

    // Local cache used for cluster leaves
    let eventsCache: EventRow[] = [];

    const ensureSourceAndLayers = () => {
      // Source
      if (!map.getSource("events")) {
        map.addSource("events", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });
      }

      // Clusters
      if (!map.getLayer("clusters")) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "events",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#111",
            "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 30, 26],
            "circle-opacity": 0.22,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#111",
          },
        });
      }

      // Cluster count labels
      if (!map.getLayer("cluster-count")) {
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "events",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: {
            "text-color": "#111",
          },
        });
      }

      // Single points
      if (!map.getLayer("unclustered-point")) {
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "events",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 7,
            "circle-color": "#000",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fff",
          },
        });
      }

      // Selected ring (ABOVE dots)
      if (!map.getLayer("selected-event")) {
        map.addLayer({
          id: "selected-event",
          type: "circle",
          source: "events",
        filter: ["all", ["!has", "point_count"], ["==", "id", "__none__"]],
          paint: {
  "circle-radius": 12,
  "circle-stroke-width": 3,
  "circle-stroke-color": "#111827",
  "circle-color": "#ffffff",
  "circle-opacity": 0.9,
},

        });
      }

      // Cursor pointers
      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));
    };

    const setMapData = (rows: EventRow[]) => {
      eventsCache = rows;
      const src = map.getSource("events") as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(toGeoJSON(rows) as any);
    };

    const onClusterClick = (ev: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(ev.point, { layers: ["clusters"] });
      const feature = features[0];
      if (!feature) return;

      const clusterId = Number(feature.properties?.cluster_id);
      if (!Number.isFinite(clusterId)) return;

      const src = map.getSource("events") as mapboxgl.GeoJSONSource;
      if (!src) return;

      // Zoom in
      src.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        if (typeof zoom !== "number") return;

        const coords = (feature.geometry as any).coordinates as [number, number];
        map.easeTo({ center: coords, zoom });
      });

      // Leaves -> sheet list (respect current filter)
      src.getClusterLeaves(clusterId, 100, 0, (err, leaves) => {
        if (err) return;
        if (!leaves || !Array.isArray(leaves)) return;

        const ids: string[] = leaves
          .map((f: any) => f?.properties?.id)
          .filter((id: any): id is string => typeof id === "string");

        const filtered = eventsCache.filter(
          (e) => ids.includes(e.id) && e.start_time && isInFilter(e.start_time)
        );

        setSheetItems(filtered);
        setSheetTitle(`${filtered.length} events`);
        setSheetOpen(true);
        setSheetState("full");
      });
    };

    const onPointClick = (ev: mapboxgl.MapMouseEvent) => {
      const feature = ev.features?.[0];
      if (!feature) return;

      const id = feature.properties?.id;
      if (typeof id === "string") setSelectedEventId(id); // STEP 5

      const coords = (feature.geometry as any).coordinates.slice();
      const title = feature.properties?.title ?? "Event";
      const start = feature.properties?.start_time ?? "";
      const address = feature.properties?.address ?? "";

      new mapboxgl.Popup({ offset: 18 })
        .setLngLat(coords)
        .setHTML(
          `<strong>${title}</strong><br/>${(start ? new Date(start) : new Date()).toLocaleString()}<br/>${
            address ?? ""
          }`
        )
        .addTo(map);
    };

    const attachHandlers = () => {
      map.off("click", "clusters", onClusterClick as any);
      map.off("click", "unclustered-point", onPointClick as any);
      map.on("click", "clusters", onClusterClick as any);
      map.on("click", "unclustered-point", onPointClick as any);
    };

    // Use style.load so layer adds are always safe
    map.on("style.load", () => {
      ensureSourceAndLayers();
      attachHandlers();
       map.resize();
      // initial data will be set by the React effect below (allEvents/filter)
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [filterReady]); // safe

  // Update map source data when events/filter changes (NO re-init)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource("events") as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    src.setData(toGeoJSON(filteredEvents) as any);
  }, [filteredEvents]);

  // Update selected ring filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getLayer("selected-event")) return;

   map.setFilter("selected-event", ["all", ["!has", "point_count"], ["==", "id", selectedEventId ?? "__none__"]]);

  }, [selectedEventId]);

  // Close handler (nice UX)
  const closeSheet = () => {
    setSheetOpen(false);
    setSheetState("peek");
    setSelectedEventId(null);
  };


  // Keep sheet list in sync with filter when sheet is showing "Upcoming events"
  useEffect(() => {
    if (!sheetOpen) return;

    // Only auto-sync if the sheet is not a cluster-specific list
    if (sheetTitle === "Upcoming events") {
      setSheetItems(filteredEvents);
    }
  }, [filteredEvents, sheetOpen, sheetTitle]);

  return (
    <main className="relative h-screen w-screen">
      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between bg-white/70 px-4 py-3 backdrop-blur-md shadow-sm">
        <div className="text-base font-semibold">Turku Events</div>

        <button
          className="rounded-full bg-white/60 px-3 py-1 text-sm font-medium shadow-sm ring-1 ring-black/5 hover:bg-white/80"
          onClick={() => {
            setSheetTitle("Upcoming events");
            setSheetItems(filteredEvents);
            setSheetOpen(true);
            setSheetState("full");
          }}
        >
          List
        </button>
      </div>

      {/* Filter chips */}
      <div className="fixed top-16 left-4 z-50 flex gap-1 rounded-full bg-white/70 p-1 backdrop-blur-md shadow-lg ring-1 ring-black/5">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            filter === "all" ? "bg-black text-white shadow-sm" : "text-black/80 hover:bg-black/5"
          }`}
        >
          All ({allCount})
        </button>

        <button
          onClick={() => setFilter("today")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            filter === "today" ? "bg-black text-white shadow-sm" : "text-black/80 hover:bg-black/5"
          }`}
        >
          Today ({todayCount})
        </button>

        <button
          onClick={() => setFilter("weekend")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            filter === "weekend" ? "bg-black text-white shadow-sm" : "text-black/80 hover:bg-black/5"
          }`}
        >
          Weekend ({weekendCount})
        </button>
      </div>

      {/* Map */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Floating add button */}
      <a
  href="/add"
  className={`fixed right-4 z-50 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-xl transition-all
    ${
      sheetOpen
        ? "bottom-[calc(60vh+1rem)]"
        : "bottom-24"
    }
  `}
>
  + Add event
</a>


      {/* Bottom sheet */}
      <BottomSheet
        open={sheetOpen}
        title={sheetTitle}
        onClose={closeSheet}
        state={sheetState}
        onToggleState={setSheetState}
      >
        {loading ? (
          <div className="py-8 text-sm text-black/60">Loading events…</div>
        ) : sheetItems.length === 0 ? (
          <div className="py-8 text-sm text-black/60">{emptyLabel}</div>
        ) : (
          <div className="space-y-3">
            {sheetItems.map((event) => {
              const isSelected = event.id === selectedEventId;

              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    setSelectedEventId(event.id);

                    // Fly to
                    mapRef.current?.flyTo({
                      center: [event.lng, event.lat],
                      zoom: Math.max(mapRef.current?.getZoom() ?? 12, 14),
                      essential: true,
                    });

                    setSheetState("full");
                  }}
                  className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
                    isSelected
                      ? "border-black/40 bg-black/5"
                      : "border-black/10 hover:bg-black/5"
                  }`}
                >
                  <div className="font-semibold">{event.title}</div>
                  <div className="text-sm text-black/60">{event.address ?? ""}</div>
                  {event.start_time ? (
                    <div className="mt-1 text-xs text-black/50">
                      {new Date(event.start_time).toLocaleString()}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </BottomSheet>
    </main>
  );
}