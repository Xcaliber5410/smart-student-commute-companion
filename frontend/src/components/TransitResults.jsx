import React, { useState } from 'react';
import { MapPin, Signpost, Train, TramFront, Bus, Ship, Navigation, ChevronDown, GraduationCap } from 'lucide-react';
import { Badge, Button, DataCard, EmptyState, MetaList, MetaRow, Select, Tabs, TabPanel } from './ui';
import { sortItems } from '../utils/listControls';
import { readTransitSortPreference, writeTransitSortPreference } from '../utils/uiPreferences';

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
 * Renders the matched GTFS stops and routes inside an accessible tab
 * (segmented control) using the shared data-display primitives
 * (Tabs / DataCard / Badge / MetaRow).
 *
 * Interactions owned here (local view state):
 * - active result tab
 * - per-tab sorting (persisted as a local UI preference)
 * - expanded/collapsed stop detail sections
 * - "set as start / destination" hand-off actions (callbacks via props)
 */
export default function TransitResults({
  stops = [],
  routes = [],
  onUseAsOrigin,
  onUseAsDestination,
}) {
  const [activeTab, setActiveTab] = useState('stops');
  const [expandedStopId, setExpandedStopId] = useState(null);
  const [sort, setSort] = useState(() => readTransitSortPreference());

  const hasDistances = stops.some((s) => typeof s.distanceMeters === 'number');

  const sortedStops = sortItems(
    stops,
    sort.stops === 'distance' ? 'distanceMeters' : 'stop_name',
    'asc'
  );
  const sortedRoutes = sortItems(
    routes,
    null,
    'asc',
    (r) => r.route_long_name || r.route_short_name || r.route_id || ''
  );

  const handleSortChange = (tabId, value) => {
    const next = { ...sort, [tabId]: value };
    setSort(next);
    writeTransitSortPreference(next);
  };

  const toggleStopDetails = (stopId) => {
    setExpandedStopId((prev) => (prev === stopId ? null : stopId));
  };

  const tabs = [
    { id: 'stops', label: 'Stops & Stations', icon: MapPin, count: stops.length },
    { id: 'routes', label: 'Routes & Lines', icon: Train, count: routes.length },
  ];

  const sortOptions =
    activeTab === 'stops'
      ? [
          { value: 'name', label: 'Sort: Name (A-Z)' },
          ...(hasDistances ? [{ value: 'distance', label: 'Sort: Nearest first' }] : []),
        ]
      : [
          { value: 'name', label: 'Sort: Name (A-Z)' },
          { value: 'type', label: 'Sort: Type of service' },
        ];

  const renderStops = () =>
    sortedStops.length === 0 ? (
      <EmptyState
        icon={<MapPin className="w-6 h-6 text-emerald-400" aria-hidden="true" />}
        title="No stops matched this search"
        description="Try a station name such as Dadar, Kurla, or Versova."
        action={
          routes.length > 0 ? (
            <button
              type="button"
              onClick={() => setActiveTab('routes')}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              View Routes &amp; Lines ({routes.length})
            </button>
          ) : null
        }
      />
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {sortedStops.map((stop) => {
          const stopId = stop.stop_id || stop.stop_name;
          const distance = formatDistance(stop.distanceMeters);
          const isExpanded = expandedStopId === stopId;
          const detailsId = `stop-details-${stopId}`;

          return (
            <DataCard
              key={stopId}
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
                <>
                  <span className="text-slate-400 text-[11px] font-mono">
                    {stop.stop_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleStopDetails(stopId)}
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-emerald-300 px-1.5 py-0.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                  >
                    <span>{isExpanded ? 'Hide details' : 'Details'}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </>
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

              {(onUseAsOrigin || onUseAsDestination) && (
                <div
                  id={detailsId}
                  hidden={!isExpanded}
                  className="mt-2.5 pt-2.5 border-t border-slate-800/70 space-y-2"
                >
                  <p className="text-[11px] text-slate-400">
                    Use this stop as the starting point or destination of a planned commute.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {onUseAsOrigin && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Navigation className="w-3.5 h-3.5" aria-hidden="true" />}
                        onClick={() => onUseAsOrigin(stop.stop_name)}
                      >
                        Set as start
                      </Button>
                    )}
                    {onUseAsDestination && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<GraduationCap className="w-3.5 h-3.5" aria-hidden="true" />}
                        onClick={() => onUseAsDestination(stop.stop_name)}
                      >
                        Set as destination
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </DataCard>
          );
        })}
      </div>
    );

  const renderRoutes = () =>
    sortedRoutes.length === 0 ? (
      <EmptyState
        icon={<Train className="w-6 h-6 text-indigo-400" aria-hidden="true" />}
        title="No lines matched this search"
        description="Try a line name such as Western Line, Harbour Line, or Metro Line 1."
        action={
          stops.length > 0 ? (
            <button
              type="button"
              onClick={() => setActiveTab('stops')}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              View Stops &amp; Stations ({stops.length})
            </button>
          ) : null
        }
      />
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {sortedRoutes.map((route) => {
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
                route.route_long_name && route.route_short_name ? (
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
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <Tabs
            idPrefix="transit-results"
            ariaLabel="Transit result type"
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <Select
            id={`transit-sort-${activeTab}`}
            aria-label={`Sort ${activeTab === 'stops' ? 'stops' : 'routes'}`}
            value={sort[activeTab]}
            onChange={(e) => handleSortChange(activeTab, e.target.value)}
            options={sortOptions}
            containerClassName="min-w-[150px]"
            className="py-1.5 text-xs"
          />
        </div>
        <span className="text-[11px] font-mono text-slate-400" aria-live="polite">
          {stops.length + routes.length} total matches
        </span>
      </div>

      <TabPanel idPrefix="transit-results" tabId={activeTab}>
        <h2 className="sr-only">
          {activeTab === 'stops' ? 'Matching stops and stations' : 'Matching routes and lines'}
        </h2>
        {activeTab === 'stops' ? renderStops() : renderRoutes()}
      </TabPanel>
    </div>
  );
}
