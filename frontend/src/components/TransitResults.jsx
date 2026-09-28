import React from 'react';
import { MapPin, Signpost, Train, TramFront, Bus, Ship, Navigation } from 'lucide-react';
import { Badge, DataCard, EmptyState, MetaList, MetaRow } from './ui';

/**
 * GTFS route_type → human label + decorative icon + Badge variant.
 * (GTFS spec: 0 tram, 1 subway/metro, 2 rail, 3 bus, 4 ferry)
 */
const ROUTE_TYPES = {
  0: { label: 'Tram / Light Rail', icon: TramFront, variant: 'teal' },
  1: { label: 'Metro', icon: TramFront, variant: 'sky' },
  2: { label: 'Suburban Rail', icon: Train, variant: 'indigo' },
  3: { label: 'Bus', icon: Bus, variant: 'amber' },
  4: { label: 'Ferry', icon: Ship, variant: 'emerald' },
};

function routeTypeOf(routeType) {
  return ROUTE_TYPES[routeType] || { label: 'Transit Line', icon: Navigation, variant: 'slate' };
}

function formatDistance(meters) {
  if (typeof meters !== 'number' || Number.isNaN(meters)) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/**
 * TransitResults - Results display for the Transit Search feature
 *
 * Renders the matched GTFS stops and routes as two responsive card grids
 * using the shared data-display primitives (DataCard / Badge / MetaRow).
 * Presentation only — the search itself is owned by the application layer.
 *
 * @param {Object} props
 * @param {Array} [props.stops=[]] - Matched GTFS stops
 * @param {Array} [props.routes=[]] - Matched GTFS routes/lines
 */
export default function TransitResults({ stops = [], routes = [] }) {
  return (
    <div className="space-y-5">
      {/* Stops */}
      <section aria-label="Matching stops and stations" className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            Stops &amp; Stations
          </h2>
          <span className="text-[11px] font-mono text-slate-400" aria-live="polite">
            {stops.length} {stops.length === 1 ? 'match' : 'matches'}
          </span>
        </div>

        {stops.length === 0 ? (
          <EmptyState
            icon={<MapPin className="w-6 h-6 text-emerald-400" aria-hidden="true" />}
            title="No stops matched this search"
            description="Try a station name such as Dadar, Kurla, or Versova."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {stops.map((stop) => {
              const distance = formatDistance(stop.distanceMeters);
              return (
                <DataCard
                  key={stop.stop_id || stop.stop_name}
                  accent="bg-emerald-500"
                  header={
                    <>
                      <Badge variant="emerald" size="xs" icon={<MapPin className="w-3 h-3" />}>
                        Stop
                      </Badge>
                      {distance && (
                        <Badge variant="teal" size="xs" icon={<Navigation className="w-3 h-3" />}>
                          {distance} away
                        </Badge>
                      )}
                    </>
                  }
                  title={<span className="font-semibold text-white">{stop.stop_name}</span>}
                  footer={
                    <span className="text-slate-400 text-[11px] font-mono">
                      {stop.stop_id}
                    </span>
                  }
                >
                  <MetaList>
                    <MetaRow
                      icon={<Signpost className="w-3.5 h-3.5 text-emerald-400" />}
                      label="Stop coordinates"
                    >
                      {Number(stop.stop_lat).toFixed(4)}, {Number(stop.stop_lon).toFixed(4)}
                    </MetaRow>
                  </MetaList>
                </DataCard>
              );
            })}
          </div>
        )}
      </section>

      {/* Routes / Lines */}
      <section aria-label="Matching routes and lines" className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Train className="w-4 h-4 text-indigo-400" aria-hidden="true" />
            Routes &amp; Lines
          </h2>
          <span className="text-[11px] font-mono text-slate-400" aria-live="polite">
            {routes.length} {routes.length === 1 ? 'match' : 'matches'}
          </span>
        </div>

        {routes.length === 0 ? (
          <EmptyState
            icon={<Train className="w-6 h-6 text-indigo-400" aria-hidden="true" />}
            title="No lines matched this search"
            description="Try a line name such as Western Line, Harbour Line, or Metro Line 1."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {routes.map((route) => {
              const type = routeTypeOf(route.route_type);
              const TypeIcon = type.icon;
              return (
                <DataCard
                  key={route.route_id || `${route.route_short_name}-${route.route_long_name}`}
                  accent="bg-indigo-500"
                  header={
                    <Badge variant={type.variant} size="xs" icon={<TypeIcon className="w-3 h-3" />}>
                      {type.label}
                    </Badge>
                  }
                  title={
                    <span className="font-semibold text-white">
                      {route.route_long_name || route.route_short_name}
                    </span>
                  }
                  subtitle={
                    route.route_long_name ? (
                      <span className="text-[11px] font-mono font-bold text-indigo-300">
                        {route.route_short_name}
                      </span>
                    ) : null
                  }
                  footer={
                    <span className="text-slate-400 text-[11px] font-mono">
                      {route.route_id}
                      {route.agency_id ? ` • ${route.agency_id}` : ''}
                    </span>
                  }
                >
                  <MetaList>
                    <MetaRow
                      icon={<TypeIcon className="w-3.5 h-3.5 text-indigo-400" />}
                      label="Route type"
                    >
                      {type.label}
                      {route.agency_id ? ` • Operated by ${route.agency_id}` : ''}
                    </MetaRow>
                  </MetaList>
                </DataCard>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
