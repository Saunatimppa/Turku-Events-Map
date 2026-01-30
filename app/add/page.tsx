"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";



export default function AddEventPage() {
    const router = useRouter();

    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markerRef = useRef<mapboxgl.Marker | null>(null);

    const [title, setTitle] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [address, setAddress] = useState("");
    const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);

    async function reverseGeocode(lng: number, lat: number) {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!token) return;

        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;

        const res = await fetch(url);
        if (!res.ok) return;

        const data = await res.json();
        const place = data?.features?.[0]?.place_name;
        if (place) setAddress(place);
    }

    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [22.2666, 60.4518], // Turku
            zoom: 12,
        });

        map.on("click", (e) => {
            const lng = e.lngLat.lng;
            const lat = e.lngLat.lat;

            setPicked({ lat, lng });
            reverseGeocode(lng, lat);

            if (!markerRef.current) {
                markerRef.current = new mapboxgl.Marker()
                    .setLngLat([lng, lat])
                    .addTo(map);
            } else {
                markerRef.current.setLngLat([lng, lat]);
            }
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
        };
    }, []);

    async function submit() {
        if (!picked || !title || !startTime || !endTime) return;

        await supabase.from("events").insert({
            title,
            address: address || null,
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            lat: picked.lat,
            lng: picked.lng,
        });

        router.push("/");
        router.refresh();
    }

    return (
        <div className="p-4 space-y-4">
            <h1 className="text-xl font-bold">Add event</h1>

            <div
                ref={mapContainerRef}
                className="h-72 rounded-xl overflow-hidden border"
            />

            <input
                className="w-full border p-2 rounded"
                placeholder="Event title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
            />

            <input
                type="datetime-local"
                className="w-full border p-2 rounded"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
            />

            <input
                type="datetime-local"
                className="w-full border p-2 rounded"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
            />

            <input
                className="w-full border p-2 rounded"
                placeholder="Address (auto-filled)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
            />

            <button
                onClick={submit}
                disabled={!picked || !title}
                className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
            >
                Create event
            </button>
        </div>
    );
}