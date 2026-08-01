import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { HotelNote } from "./types";
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitBounds({ notes }: { notes: HotelNote[] }) {
  const map = useMap();
  useEffect(() => {
    if (notes.length === 0) return;
    if (notes.length === 1) {
      map.setView([notes[0].latitude, notes[0].longitude], 12);
      return;
    }
    const bounds = L.latLngBounds(
      notes.map((n) => [n.latitude, n.longitude] as [number, number]),
    );
    map.fitBounds(bounds.pad(0.2));
  }, [map, notes]);
  return null;
}

export default function HotelsMap({
  notes,
  focusId,
}: {
  notes: HotelNote[];
  focusId?: string | null;
}) {
  const center: [number, number] =
    notes.length > 0
      ? [notes[0].latitude, notes[0].longitude]
      : [36.8, 31.4];

  const focus = focusId ? notes.find((n) => n.id === focusId) : null;

  return (
    <MapContainer
      center={center}
      zoom={8}
      className="h-full min-h-[320px] w-full rounded-2xl"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <PlainLeafletPrefix />
      <FitBounds notes={notes} />
      {focus ? (
        <FlyTo lat={focus.latitude} lng={focus.longitude} />
      ) : null}
      {notes.map((n) => (
        <Marker
          key={n.id}
          position={[n.latitude, n.longitude]}
          icon={markerIcon}
        >
          <Popup>
            <div className="min-w-[160px] text-sm">
              <div className="font-semibold">{n.name}</div>
              {n.priceTwoRooms ? (
                <div>2 rooms: {n.priceTwoRooms}</div>
              ) : null}
              {n.priceOneRoom ? <div>1 room: {n.priceOneRoom}</div> : null}
              {n.notes ? (
                <div className="mt-1 text-slate-600">{n.notes}</div>
              ) : null}
              {n.pageUrl ? (
                <a href={n.pageUrl} target="_blank" rel="noreferrer">
                  Open hotel
                </a>
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

function PlainLeafletPrefix() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl?.setPrefix(
      '<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>',
    );
  }, [map]);
  return null;
}

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 13);
  }, [map, lat, lng]);
  return null;
}
