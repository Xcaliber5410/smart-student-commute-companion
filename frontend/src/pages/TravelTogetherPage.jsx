import React from 'react';
import TravelTogether from '../components/TravelTogether';
import { LoadingState, ErrorState } from '../components/ui';

/**
 * TravelTogetherPage - Core "Travel Together" feature page structure
 *
 * Composes the commute-coordination feature into a single semantic page:
 * - Page heading (h1) for document outline
 * - Ride group list with loading/error placeholders
 *
 * Presentation container only: data loading and group actions arrive via props.
 *
 * @param {Object} props
 * @param {Array} props.groups - Commute coordination groups
 * @param {Function} props.onJoinGroup - Join a group
 * @param {Function} props.onOpenCreateGroup - Open the create-group dialog
 * @param {boolean} props.isLoading - Whether group data is loading
 * @param {string|null} props.loadError - User-friendly load error message
 * @param {Function} props.onRetryLoad - Retry loading group data
 * @param {boolean} props.isRefreshing - Whether a background refresh is running
 */
export default function TravelTogetherPage({
  groups = [],
  onJoinGroup,
  onOpenCreateGroup,
  isLoading = false,
  loadError = null,
  onRetryLoad,
  isRefreshing = false,
}) {
  return (
    <div className="space-y-5">
      <header className="pb-1">
        <h1 className="text-xl font-extrabold text-white tracking-tight">
          Travel Together
        </h1>
        <p className="text-sm text-slate-400">
          Safe student grouping for auto-pooling and local train buddies
        </p>
      </header>

      <section aria-label="Commute groups" aria-busy={isLoading || isRefreshing}>
        {isLoading ? (
          <LoadingState
            title="Loading commute groups..."
            description="Fetching open student ride pools for your college routes."
          />
        ) : loadError ? (
          <ErrorState
            title="Commute groups unavailable"
            message={loadError}
            onRetry={onRetryLoad}
            retryLabel="Reload Groups"
          />
        ) : (
          <TravelTogether
            groups={groups}
            onJoinGroup={onJoinGroup}
            onOpenCreateGroup={onOpenCreateGroup}
          />
        )}
      </section>
    </div>
  );
}
