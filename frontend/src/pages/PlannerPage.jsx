import React from 'react';
import PlannerForm from '../components/PlannerForm';
import RouteResults from '../components/RouteResults';
import LiveStudentFeed from '../components/LiveStudentFeed';
import { LoadingState, ErrorState } from '../components/ui';

/**
 * PlannerPage - Core "Plan Route" feature page structure
 *
 * Composes the planner feature areas from a single semantic page:
 * - Page heading (h1) for document outline
 * - Commute planner form
 * - Route recommendations with a loading placeholder
 * - Embedded live student feed with loading/error placeholders
 *
 * This is a presentation container: all business logic and API
 * communication live outside the page and arrive via props.
 *
 * @param {Object} props
 * @param {Object} props.formData - Planner form values
 * @param {Function} props.setFormData - Form updater
 * @param {Function} props.onPlan - Submit the commute plan request
 * @param {boolean} props.isPlanning - Whether a plan request is in flight
 * @param {Object|null} props.planResult - Latest plan result
 * @param {string|null} props.selectedRouteId - Currently selected route
 * @param {Function} props.setSelectedRouteId - Route selection updater
 * @param {Function} props.onOpenFeedback - Open feedback dialog for a recommendation
 * @param {Array} props.reports - Live disruption reports
 * @param {Function} props.onConfirm - Confirm a report
 * @param {Function} props.onContradict - Contradict a report
 * @param {Function} props.onOpenCreateReport - Open the report dialog
 * @param {boolean} props.isConnected - Live socket connection status
 * @param {boolean} props.isLoadingInitial - Whether initial data is loading
 * @param {string|null} props.loadError - User-friendly initial load error
 * @param {Function} props.onRetryLoad - Retry the initial data load
 */
export default function PlannerPage({
  formData,
  setFormData,
  onPlan,
  isPlanning,
  planResult,
  selectedRouteId,
  setSelectedRouteId,
  onOpenFeedback,
  reports = [],
  onConfirm,
  onContradict,
  onOpenCreateReport,
  isConnected,
  isLoadingInitial = false,
  loadError = null,
  onRetryLoad,
}) {
  return (
    <div className="space-y-5">
      {/* Page heading — establishes the h1 for this view */}
      <header className="pb-1">
        <h1 className="text-xl font-extrabold text-white tracking-tight">
          Plan Your Commute
        </h1>
        <p className="text-sm text-slate-400">
          Multimodal AI transit recommendations across Mumbai campuses
        </p>
      </header>

      <PlannerForm
        formData={formData}
        setFormData={setFormData}
        onPlan={onPlan}
        isLoading={isPlanning}
      />

      {/* Route recommendations */}
      <section aria-label="Route recommendations" aria-busy={isPlanning}>
        {isPlanning && !planResult ? (
          <LoadingState
            title="Calculating best routes..."
            description="Scoring transit options for travel time, reliability, budget, and weather."
          />
        ) : (
          <RouteResults
            planResult={planResult}
            selectedRouteId={selectedRouteId}
            setSelectedRouteId={setSelectedRouteId}
            onOpenFeedback={onOpenFeedback}
          />
        )}
      </section>

      {/* Live student feed (embedded) */}
      <section aria-label="Live student updates" aria-busy={isLoadingInitial}>
        {isLoadingInitial ? (
          <LoadingState
            title="Loading live student updates..."
            description="Fetching the latest crowd-sourced disruption reports."
          />
        ) : loadError ? (
          <ErrorState
            title="Live updates unavailable"
            message={loadError}
            onRetry={onRetryLoad}
            retryLabel="Reload Updates"
          />
        ) : (
          <LiveStudentFeed
            reports={reports}
            onConfirm={onConfirm}
            onContradict={onContradict}
            onOpenCreateReport={onOpenCreateReport}
            isConnected={isConnected}
          />
        )}
      </section>
    </div>
  );
}
