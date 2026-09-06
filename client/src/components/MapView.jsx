import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

// Custom SVG Icons
function createCustomIcon(color, label, iconSvg) {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      ">
        <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
          ${iconSvg}
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
}

const originIcon = createCustomIcon('#10b981', 'Origin', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><circle cx="12" cy="12" r="6"/></svg>');
const destIcon = createCustomIcon('#6366f1', 'College', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>');
const transitIcon = createCustomIcon('#f59e0b', 'Station', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/></svg>');

// Helper component to auto fit map bounds
function FitBoundsToRoutes({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [bounds, map]);
  return null;
}

export default function MapView({ 
  planResult, 
  selectedRouteId, 
  disruptionReports = [] 
}) {
  // Default coordinates: Central Mumbai
  const defaultCenter = [19.0760, 72.8777];

  const allRoutes = useMemo(() => {
    if (!planResult) return [];
    const list = [planResult.recommendation.route];
    if (planResult.alternatives) {
      list.push(...planResult.alternatives);
    }
    return list;
  }, [planResult]);

  const selectedRoute = useMemo(() => {
    return allRoutes.find(r => r.id === selectedRouteId) || allRoutes[0];
  }, [allRoutes, selectedRouteId]);

  // Compute bounding box for map
  const bounds = useMemo(() => {
    if (!planResult || !planResult.query) return null;
    const { origin, destination } = planResult.query;
    const latLngs = [
      [origin.lat, origin.lon],
      [destination.lat, destination.lon]
    ];

    if (selectedRoute && selectedRoute.geometry && selectedRoute.geometry.coordinates) {
      selectedRoute.geometry.coordinates.forEach(coord => {
        latLngs.push([coord[1], coord[0]]);
      });
    }

    return L.latLngBounds(latLngs);
  }, [planResult, selectedRoute]);

  // Convert GeoJSON coordinates [lon, lat] to Leaflet [lat, lon]
  const parseCoordinates = (geometry) => {
    if (!geometry || !geometry.coordinates) return [];
    return geometry.coordinates.map(c => [c[1], c[0]]);
  };

  return (
    <div className="relative w-full h-[500px] lg:h-full min-h-[450px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Map Legend Overlay */}
      <div className="absolute top-3 left-3 z-[1000] bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-2 text-xs space-y-1 shadow-lg">
        <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider mb-1 flex items-center justify-between gap-4">
          <span>Map Legend</span>
          <span className="text-[10px] text-emerald-400">OpenStreetMap</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300 text-[11px]">
          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white"></span>
          <span>Starting Area</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300 text-[11px]">
          <span className="w-3 h-3 rounded-full bg-indigo-500 border border-white"></span>
          <span>College Destination</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300 text-[11px]">
          <span className="w-3.5 h-1 rounded-full bg-emerald-400"></span>
          <span>Selected Route</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300 text-[11px]">
          <span className="w-3 h-3 rounded-full bg-amber-500/40 border border-amber-400"></span>
          <span>Live Community Disruption</span>
        </div>
      </div>

      <MapContainer
        center={bounds ? bounds.getCenter() : defaultCenter}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        {/* OpenStreetMap Tile Layer - strictly compliant with zero Mapbox */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {bounds && <FitBoundsToRoutes bounds={bounds} />}

        {/* Origin Marker */}
        {planResult && planResult.query && (
          <Marker 
            position={[planResult.query.origin.lat, planResult.query.origin.lon]} 
            icon={originIcon}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold text-emerald-400">Origin Area</div>
                <div className="text-slate-200 mt-0.5">{planResult.query.origin.display_name}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {planResult && planResult.query && (
          <Marker 
            position={[planResult.query.destination.lat, planResult.query.destination.lon]} 
            icon={destIcon}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold text-indigo-400">Destination College</div>
                <div className="text-slate-200 mt-0.5">{planResult.query.destination.display_name}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Alternative Routes Polylines (Subtle Muted Lines) */}
        {allRoutes.map(route => {
          if (route.id === selectedRoute?.id) return null;
          const coords = parseCoordinates(route.geometry);
          if (coords.length === 0) return null;
          return (
            <Polyline
              key={route.id}
              positions={coords}
              pathOptions={{
                color: '#64748b',
                weight: 3.5,
                opacity: 0.5,
                dashArray: '4, 8'
              }}
            />
          );
        })}

        {/* Active Selected Route Polyline (Bold Vibrant Glow) */}
        {selectedRoute && selectedRoute.geometry && (
          <>
            {/* Glow backing */}
            <Polyline
              positions={parseCoordinates(selectedRoute.geometry)}
              pathOptions={{
                color: '#10b981',
                weight: 8,
                opacity: 0.25
              }}
            />
            {/* Main Polyline */}
            <Polyline
              positions={parseCoordinates(selectedRoute.geometry)}
              pathOptions={{
                color: selectedRoute.primaryMode === 'metro' ? '#f59e0b' : (selectedRoute.primaryMode === 'train' ? '#38bdf8' : '#10b981'),
                weight: 4.5,
                opacity: 0.95
              }}
            />
          </>
        )}

        {/* Transit Station Markers */}
        {selectedRoute && selectedRoute.transitStations?.map((station, idx) => (
          <Marker
            key={idx}
            position={[station.lat, station.lon]}
            icon={transitIcon}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold text-amber-400">Transit Stop</div>
                <div className="text-slate-200">{station.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Verified Mumbai GTFS Stop</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Disruption Warning Area Circles */}
        {disruptionReports.map((report) => {
          // Map report area to representative coordinates
          let reportLat = 19.1197;
          let reportLon = 72.8464;
          if (report.area.toLowerCase().includes('andheri')) {
            reportLat = 19.1197; reportLon = 72.8464;
          } else if (report.area.toLowerCase().includes('powai') || report.area.toLowerCase().includes('jvlr')) {
            reportLat = 19.1220; reportLon = 72.9050;
          } else if (report.area.toLowerCase().includes('dadar')) {
            reportLat = 19.0180; reportLon = 72.8435;
          } else if (report.area.toLowerCase().includes('ghatkopar')) {
            reportLat = 19.0864; reportLon = 72.9081;
          }

          return (
            <Circle
              key={report.id}
              center={[reportLat, reportLon]}
              radius={450}
              pathOptions={{
                color: report.impact === 'high' ? '#ef4444' : '#f59e0b',
                fillColor: report.impact === 'high' ? '#ef4444' : '#f59e0b',
                fillOpacity: 0.25,
                weight: 2
              }}
            >
              <Popup>
                <div className="text-xs max-w-[200px]">
                  <div className="font-bold text-amber-400 flex items-center gap-1">
                    <span>⚠ Community Disruption</span>
                  </div>
                  <div className="font-semibold text-white mt-0.5">{report.area}</div>
                  <p className="text-slate-300 mt-1 text-[11px] leading-snug">{report.message}</p>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span>By {report.pseudonym}</span>
                    <span>{report.ageFormatted}</span>
                  </div>
                </div>
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>
    </div>
  );
}
