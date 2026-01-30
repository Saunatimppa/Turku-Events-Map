"use client";

import mapboxgl from "mapbox-gl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import BottomSheet from "../components/BottomSheet";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  address: string | null;
  lat: number;
  lng: number;
};

export default function Home() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Bottom sheet
  const [sheetTitle, setSheetTitle] = useState("Upcoming events");
  const [sheetItems, setSheetItems] = useState<EventRow[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
const [sheetState, setSheetState] = useState<"peek" | "full">("peek");

  const [allEvents, setAllEvents] = useState<EventRow[]>([]);
const [filter, setFilter] = useState<"all" | "today" | "weekend">("all");
const [filterReady, setFilterReady] = useState(false);
const [loading, setLoading] = useState(true);
const [selectedEventId, setSelectedEventId] = useState<string | null>(null);



useLayoutEffect(() => {
  const saved = window.localStorage.getItem("turku_filter");
  if (saved === "today" || saved === "weekend" || saved === "all") {
    setFilter(saved);
  }
  setFilterReady(true);
}, []);

useEffect(() => {
  window.localStorage.setItem("turku_filter", filter);
}, [filter]);

  function isInFilter(startISO: string) {
    const eventDate = new Date(startISO);

    if (filter === "all") return true;

    if (filter === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date();
      end.setHours(23, 59, 59, 999);

      return eventDate >= start && eventDate <= end;
    }

    // weekend (Sat + Sun of this week)
    const now = new Date();
    const day = now.getDay(); // Sun=0 ... Sat=6

    const saturday = new Date(now);
    saturday.setDate(now.getDate() + ((6 - day + 7) % 7));
    saturday.setHours(0, 0, 0, 0);

    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    sunday.setHours(23, 59, 59, 999);

    return eventDate >= saturday && eventDate <= sunday;
  }
function isToday(startISO: string) {
  const d = new Date(startISO);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return d >= start && d <= end;
}

function isWeekend(startISO: string) {
  const d = new Date(startISO);

  const now = new Date();
  const day = now.getDay(); // Sun=0 ... Sat=6

  const saturday = new Date(now);
  saturday.setDate(now.getDate() + ((6 - day + 7) % 7));
  saturday.setHours(0, 0, 0, 0);

  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  sunday.setHours(23, 59, 59, 999);

  return d >= saturday && d <= sunday;
}

  // When filter or allEvents changes -> update bottom sheet contents + title
  useEffect(() => {
    const filtered = allEvents.filter(
      (e) => e.start_time && isInFilter(e.start_time)
    );

    setSheetItems(filtered);

    if (filter === "all") setSheetTitle("Upcoming events");
    if (filter === "today") setSheetTitle("Today's events");
    if (filter === "weekend") setSheetTitle("Weekend events");
  }, [filter, allEvents]);

  // Whenever filter/sheetItems changes -> update Mapbox source data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource("events") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: sheetItems
        .filter((e) => e.start_time && isInFilter(e.start_time))
        .map((e) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [e.lng, e.lat],
          },
          properties: {
            id: e.id,
            title: e.title,
            start_time: e.start_time,
            address: e.address ?? "",
          },
        })),
    };

    source.setData(geojson);
  }, [filter, sheetItems]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
console.log("MAPBOX TOKEN present?", !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

    const map = new mapboxgl.Map({
      container: containerRef.current,
style: "mapbox://styles/mapbox/streets-v12",


      center: [22.2666, 60.4518], // Turku
      zoom: 12,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    // We'll keep events in a local variable so click handlers can access them
    let eventsCache: EventRow[] = [];

    const loadAndRender = async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_time", { ascending: true });

      if (error) {
        console.error("Supabase error:", error.message);
        return;
      }

      const events = (data ?? []) as EventRow[];
      eventsCache = events;
      setAllEvents(events);
      setLoading(false);


      // Build GeoJSON (filtered by current filter)
      const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
        type: "FeatureCollection",
        features: events
          .filter((e) => e.start_time && isInFilter(e.start_time))
          .map((e) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [e.lng, e.lat],
            },
            properties: {
              id: e.id,
              title: e.title,
              start_time: e.start_time,
              address: e.address ?? "",
            },
          })),
      };

      // ✅ Update existing source if it exists; otherwise create source + layers once
      const existing = map.getSource("events") as
        | mapboxgl.GeoJSONSource
        | undefined;

      if (existing) {
        existing.setData(geojson);
        return;
      }

      map.addSource("events", {
        type: "geojson",
        data: geojson, // never undefined
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      // Cluster circles
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "events",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#000",
          "circle-radius": ["step", ["get", "point_count"], 20, 5, 25, 10, 30],
          "circle-opacity": 0.8,
        },
      });

      // Cluster count text
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "events",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
        },
        paint: {
          "text-color": "#fff",
        },
      });

      // Single points
      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "events",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 8,
          "circle-color": "#000",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      // --- Click handlers (added once, after layers exist) ---

      // Click cluster -> fill bottom sheet with events in that cluster + zoom in a bit
      map.on("click", "clusters", (ev) => {
        const features = map.queryRenderedFeatures(ev.point, {
          layers: ["clusters"],
        });
        const feature = features[0];
        if (!feature) return;

        const clusterId = Number(feature.properties?.cluster_id);
        if (!Number.isFinite(clusterId)) return;

        const src = map.getSource("events") as mapboxgl.GeoJSONSource;

        // Zoom into the cluster
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          if (typeof zoom !== "number") return;

          const coords = (feature.geometry as any).coordinates as [
            number,
            number
          ];
          map.easeTo({ center: coords, zoom });
        });

        // Get the points inside the cluster and show them in the sheet
        src.getClusterLeaves(clusterId, 100, 0, (err, leaves) => {
          if (err) return;
          if (!leaves || !Array.isArray(leaves)) return;

          const ids: string[] = leaves
            .map((f: any) => f?.properties?.id)
            .filter((id: any): id is string => typeof id === "string");

          // Keep cluster list consistent with current filter
          const filtered = eventsCache.filter(
            (e) => ids.includes(e.id) && e.start_time && isInFilter(e.start_time)
          );

          setSheetItems(filtered);
          setSheetTitle(`${filtered.length} events`);
          setSheetOpen(true)
      setSheetState("full");
        });
      });

      // Click single point -> popup
      map.on("click", "unclustered-point", (ev) => {
        const feature = ev.features?.[0];
        if (!feature) return;

        const coords = (feature.geometry as any).coordinates.slice();
        const title = feature.properties?.title ?? "Event";
        const start = feature.properties?.start_time ?? "";
        const address = feature.properties?.address ?? "";

        new mapboxgl.Popup({ offset: 18 })
          .setLngLat(coords)
          .setHTML(
            `<strong>${title}</strong><br/>${new Date(
              start
            ).toLocaleString()}<br/>${address}`
          )
          .addTo(map);
      });

      // Cursor pointers
      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));
    };

    // If the style loads later, run once; if it's already loaded (hot reload), run immediately
    if (map.isStyleLoaded()) {
      loadAndRender();
    } else {
      map.once("load", loadAndRender);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);
const allCount = allEvents.length;
const todayCount = allEvents.filter(
  (e) => e.start_time && isToday(e.start_time)
).length;
const weekendCount = allEvents.filter(
  (e) => e.start_time && isWeekend(e.start_time)
).length;

 return (
  <main className="relative h-screen w-screen">
    {/* Top bar */}
    <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between bg-white/70 px-4 py-3 backdrop-blur-md shadow-sm">
      <div className="text-base font-semibold">Turku Events</div>

      <button
        className="rounded-full bg-white/60 px-3 py-1 text-sm font-medium shadow-sm ring-1 ring-black/5 hover:bg-white/80"
        onClick={() => {
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
          filter === "all"
            ? "bg-black text-white shadow-sm"
            : "text-black/80 hover:bg-black/5"
        }`}
      >
      All ({allCount})

      </button>

      <button
        onClick={() => setFilter("today")}
        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
          filter === "today"
            ? "bg-black text-white shadow-sm"
            : "text-black/80 hover:bg-black/5"
        }`}
      >
       Today ({todayCount})
      </button>

      <button
        onClick={() => setFilter("weekend")}
        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
          filter === "weekend"
            ? "bg-black text-white shadow-sm"
            : "text-black/80 hover:bg-black/5"
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
      className="fixed bottom-24 right-4 z-50 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-black/20 active:scale-[0.98] transition"
    >
      + Add event
    </a>

    {/* Bottom sheet */}
    <BottomSheet open={sheetOpen} title={sheetTitle} onClose={() => {
      setSheetOpen(false);
      setSheetState("peek");
    }}>
      {loading ? (
  <div className="text-sm opacity-60">Loading events…</div>
) : sheetItems.length === 0 ? (
  <div className="text-sm opacity-60">
    No events{" "}
    {filter === "today" ? "today" : filter === "weekend" ? "this weekend" : "yet"}.
  </div>
) : (

        <div className="space-y-3">
         {sheetItems.map((event) => {
  const isSelected = event.id === selectedEventId;

  return (
    <button
      key={event.id}
      type="button"
      onClick={() => setSelectedEventId(event.id)}
      className={`w-full text-left rounded-2xl border px-4 py-3 mb-2 transition
        ${
          isSelected
            ? "border-black/40 bg-black/5"
            : "border-black/10 hover:bg-black/5"
        }`}
    >
      <div className="font-semibold">{event.title}</div>
      <div className="text-sm text-black/60">
        {event.address}
      </div>
    </button>
  );
})}
        </div>
)}
    </BottomSheet>
  </main>
);
}

