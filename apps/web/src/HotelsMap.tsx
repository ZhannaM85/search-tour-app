import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import type { HotelNote } from "./types";
import { formatHotelQuality } from "./types";
import { formatPrice } from "./formatPrice";
import StarIcon from "./StarIcon";

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

function FitBounds({
  notes,
  enabled,
}: {
  notes: HotelNote[];
  enabled: boolean;
}) {
  const map = useMap();
  const signature = useMemo(
    () => notes.map((n) => n.id).sort().join(","),
    [notes],
  );

  useEffect(() => {
    if (!enabled || notes.length === 0) return;
    if (notes.length === 1) {
      map.setView([notes[0].latitude, notes[0].longitude], 12);
      return;
    }
    const bounds = L.latLngBounds(
      notes.map((n) => [n.latitude, n.longitude] as [number, number]),
    );
    map.fitBounds(bounds.pad(0.2));
  }, [map, notes, signature, enabled]);
  return null;
}

function HotelMarker({
  note,
  focused,
  focusNonce,
}: {
  note: HotelNote;
  focused: boolean;
  focusNonce: number;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const map = useMap();

  useEffect(() => {
    if (!focused) {
      markerRef.current?.closePopup();
      return;
    }
    map.flyTo([note.latitude, note.longitude], 13);
    const marker = markerRef.current;
    if (!marker) return;
    // Open after fly starts so the popup stays on-screen.
    const t = window.setTimeout(() => {
      marker.openPopup();
    }, 280);
    return () => window.clearTimeout(t);
  }, [focused, focusNonce, map, note.latitude, note.longitude]);

  return (
    <Marker
      ref={markerRef}
      position={[note.latitude, note.longitude]}
      icon={markerIcon}
    >
      <Popup>
        <div className="min-w-[160px] text-sm">
          {note.photoUrl ? (
            <img
              src={note.photoUrl}
              alt=""
              className="mb-1 h-20 w-full rounded object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div className="flex items-center gap-1 font-semibold">
            {note.favorite ? (
              <StarIcon filled className="h-4 w-4 text-amber-400" />
            ) : null}
            <span>{note.name}</span>
          </div>
          {(() => {
            const quality = formatHotelQuality(note);
            return quality ? (
              <div className="text-slate-600">{quality}</div>
            ) : null;
          })()}
          {note.priceOneRoom ? (
            <div>
              1 room: {formatPrice(note.priceOneRoom)}
              {note.operatorOneRoom ? ` (${note.operatorOneRoom})` : ""}
            </div>
          ) : null}
          {note.priceTwoRooms ? (
            <div>
              2 rooms: {formatPrice(note.priceTwoRooms)}
              {note.operatorTwoRooms ? ` (${note.operatorTwoRooms})` : ""}
            </div>
          ) : null}
          {note.priceThreeRooms ? (
            <div>
              3 rooms: {formatPrice(note.priceThreeRooms)}
              {note.operatorThreeRooms ? ` (${note.operatorThreeRooms})` : ""}
            </div>
          ) : null}
          {note.notes ? (
            <div className="mt-1 text-slate-600">{note.notes}</div>
          ) : null}
          {note.pageUrl ? (
            <a href={note.pageUrl} target="_blank" rel="noreferrer">
              Open hotel
            </a>
          ) : null}
        </div>
      </Popup>
    </Marker>
  );
}

export default function HotelsMap({
  notes,
  focusId,
  focusNonce = 0,
}: {
  notes: HotelNote[];
  focusId?: string | null;
  focusNonce?: number;
}) {
  const center: [number, number] =
    notes.length > 0
      ? [notes[0].latitude, notes[0].longitude]
      : [36.8, 31.4];

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
      <FitBounds notes={notes} enabled={!focusId} />
      {notes.map((n) => (
        <HotelMarker
          key={n.id}
          note={n}
          focused={n.id === focusId}
          focusNonce={focusNonce}
        />
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
