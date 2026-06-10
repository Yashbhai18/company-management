"use client";
import React from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationPickerMapProps {
  lat: number;
  lng: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
  existingLocations?: any[];
}

function MapEvents({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function ChangeView({ center, hasSpecificLocation }: { center: [number, number], hasSpecificLocation: boolean }) {
  const map = useMap();
  React.useEffect(() => {
    if (center[0] && center[1]) {
      // Zoom in to 15 if a specific location is chosen, otherwise stay at zoom 5 for India overview
      map.flyTo(center, hasSpecificLocation ? 15 : 5, { duration: 1.5 });
    }
  }, [center, map, hasSpecificLocation]);
  return null;
}

export default function LocationPickerMap({ lat, lng, radius, onChange, existingLocations = [] }: LocationPickerMapProps) {
  // Memoize icon to prevent re-creation and potential Leaflet attachment errors
  const premiumIcon = React.useMemo(() => new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
    iconRetinaUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -38],
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    shadowSize: [41, 41],
  }), []);

  const center: [number, number] = React.useMemo(() => [
    isValidCoord(lat) ? lat : 20.5937, 
    isValidCoord(lng) ? lng : 78.9629
  ], [lat, lng]);

  function isValidCoord(val: any) {
    const n = parseFloat(val);
    return !isNaN(n) && n !== 0;
  }

  const hasSpecificLocation = isValidCoord(lat) && isValidCoord(lng);

  return (
    <div className="map-wrapper" style={{ height: '100%', width: '100%', position: 'relative', background: '#1e293b' }}>
      <MapContainer 
        center={center} 
        zoom={hasSpecificLocation ? 15 : 5} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="dark-tiles"
        />
        
        <ChangeView center={center} hasSpecificLocation={hasSpecificLocation} />
        <MapEvents onChange={onChange} />
        
        {isValidCoord(lat) && isValidCoord(lng) && (
          <>
            <Marker position={[lat, lng]} icon={premiumIcon} />
            <Circle 
              center={[lat, lng]} 
              radius={radius || 300} 
              pathOptions={{ fillColor: '#ff7a30', color: '#ff7a30', fillOpacity: 0.2 }} 
            />
          </>
        )}

        {existingLocations.filter(loc => isValidCoord(loc.lat) && isValidCoord(loc.lng)).map((loc) => (
          <Circle 
            key={loc._id}
            center={[loc.lat, loc.lng]} 
            radius={loc.radius || 300} 
            pathOptions={{ fillColor: '#4CAF50', color: '#4CAF50', fillOpacity: 0.1, weight: 1 }} 
          >
            <Marker position={[loc.lat, loc.lng]} icon={premiumIcon} />
          </Circle>
        ))}
      </MapContainer>
    </div>
  );
}
