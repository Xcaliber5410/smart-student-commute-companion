import React, { useState, useEffect, useRef } from 'react';
import MainLayout from './layouts/MainLayout';
import Toast from './components/Toast';
import NotFound from './components/NotFound';
import MapView from './components/MapView';
import CreateReportModal from './components/CreateReportModal';
import CreateGroupModal from './components/CreateGroupModal';
import FeedbackModal from './components/FeedbackModal';
import { PlannerPage, TravelTogetherPage, LiveAlertsPage, TransitSearchPage } from './pages';
import { 
  requestPlan, 
  sendFeedback
} from './services/planner';
import { 
  listReports, 
  createReport, 
  voteStillHappening, 
  voteCleared 
} from './services/liveReports';
import { 
  listGroups, 
  createGroup, 
  joinGroup 
} from './services/rideGroups';
import { searchTransit } from './services/transit';
import { readRecentSearches, rememberSearch, clearRecentSearches } from './utils/uiPreferences';
import { resetDemoState } from './services/api';
import { getSocket } from './services/socket';
import useAsyncResource from './hooks/useAsyncResource';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('planner');
  const [isConnected, setIsConnected] = useState(false);
  // True only AFTER a live-stream disconnect/connect failure (never on first paint)
  const [isConnectionLost, setIsConnectionLost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toast, setToast] = useState(null);

  // Live Reports — async resource (loading/refreshing/error with stale-response guards)
  const reportsResource = useAsyncResource(
    () => listReports(),
    { errorMessage: 'Unable to load live student updates. Please check your connection and try again.' }
  );

  // Ride Groups — async resource
  const groupsResource = useAsyncResource(
    () => listGroups(),
    { errorMessage: 'Unable to load commute groups. Please check your connection and try again.' }
  );

  // Transit Search — on-demand resource (request params are supplied per search)
  const transitParamsRef = useRef({});
  const transitResource = useAsyncResource(
    () => searchTransit(transitParamsRef.current),
    { errorMessage: 'Unable to search the transit network. Please check your connection and try again.' }
  );

  const reports = reportsResource.data || [];
  const groups = groupsResource.data || [];

  // Transit Search query state (draft is preserved while navigating between screens)
  const [transitQuery, setTransitQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState(() => readRecentSearches());

  // Planner Form State
  const [formData, setFormData] = useState({
    origin: 'Andheri East',
    destination: 'IIT Bombay Powai',
    desiredArrivalTime: '09:00',
    preferredModes: ['train', 'metro', 'bus', 'auto', 'walk'],
    preference: 'balanced',
    walkingToleranceMinutes: 20,
    maxBudgetRupees: 100
  });

  // Results State
  const [planResult, setPlanResult] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  // Live Reports modal state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Travel Together modal state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);

  // Feedback State
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackRecId, setFeedbackRecId] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Initial Data & Socket Setup
  useEffect(() => {
    // 1. Fetch initial reports and ride groups (each resource guards against stale responses)
    reportsResource.load();
    groupsResource.load();

    // 2. Setup Socket.IO
    const socket = getSocket();

    socket.on('connect', () => {
      setIsConnected(true);
      setIsConnectionLost(false);
      socket.emit('join_commute_channel', { area: 'mumbai_general' });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsConnectionLost(true);
    });

    socket.on('connect_error', () => {
      setIsConnected(false);
      setIsConnectionLost(true);
    });

    socket.on('live_report_created', (newReport) => {
      reportsResource.setData((prev) => [newReport, ...(prev || []).filter(r => r.id !== newReport.id)]);
      showToast(`⚠ Live Report from ${newReport.area}: ${newReport.message.substring(0, 50)}...`, 'warning');
    });

    socket.on('live_report_updated', (updatedReport) => {
      reportsResource.setData((prev) => (prev || []).map(r => r.id === updatedReport.id ? { ...r, ...updatedReport } : r));
    });

    socket.on('live_report_expired', ({ id }) => {
      reportsResource.setData((prev) => (prev || []).filter(r => r.id !== id));
    });

    socket.on('demo_reset', ({ freshReports }) => {
      if (freshReports) reportsResource.setData(freshReports);
      groupsResource.load();
      showToast('Demo environment reset successfully', 'info');
    });

    // 3. Auto-plan default commute on first load
    handlePlan(true);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('live_report_created');
      socket.off('live_report_updated');
      socket.off('live_report_expired');
      socket.off('demo_reset');
    };
  }, []);

  // Execute Commute Planning (ref-guarded against duplicate rapid submissions)
  const planInFlightRef = useRef(false);
  const handlePlan = async (isInitial = false) => {
    if (planInFlightRef.current) return; // ignore duplicate submissions
    planInFlightRef.current = true;
    setIsLoading(true);
    try {
      const data = await requestPlan(formData);
      if (data.success) {
        setPlanResult(data);
        const bestRoute = data.recommendation?.route;
        setSelectedRouteId(bestRoute?.id || null);
        if (!isInitial) {
          if (bestRoute) {
            showToast(`Found ${data.allCandidatesCount} options! Best route: ${bestRoute.title} (₹${bestRoute.fareRupees})`);
          } else {
            showToast('No routes matched your selected modes and budget.', 'warning');
          }
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      planInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  // Live Report Actions
  const handleCreateReport = async (reportData) => {
    if (isSubmittingReport) return; // prevent duplicate submissions
    setIsSubmittingReport(true);
    try {
      await createReport(reportData);
      setIsReportModalOpen(false);
      showToast('Live commute report broadcast to all students!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleConfirmReport = async (id) => {
    try {
      await voteStillHappening(id);
      showToast('Thank you! Marked report as still active.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleContradictReport = async (id) => {
    try {
      await voteCleared(id);
      showToast('Thank you! Noted that disruption has cleared.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Travel Together Actions
  const handleCreateGroup = async (groupData) => {
    if (isSubmittingGroup) return; // prevent duplicate submissions
    setIsSubmittingGroup(true);
    try {
      await createGroup(groupData);
      setIsGroupModalOpen(false);
      await groupsResource.load();
      showToast('Commute coordination group created!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmittingGroup(false);
    }
  };

  const handleJoinGroup = async (groupId) => {
    try {
      await joinGroup(groupId);
      await groupsResource.load();
      showToast('Successfully joined commute group!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Refresh helpers — surface background-refresh failures instead of silently
  // keeping stale data (useAsyncResource keeps loaded data on refresh errors)
  const handleRefreshReports = async () => {
    const result = await reportsResource.load();
    if (!result?.ok && result?.keptData) {
      showToast('Could not refresh live alerts — showing the previously loaded reports.', 'warning');
    }
    return result;
  };

  const handleRefreshGroups = async () => {
    const result = await groupsResource.load();
    if (!result?.ok && result?.keptData) {
      showToast('Could not refresh commute groups — showing the previously loaded groups.', 'warning');
    }
    return result;
  };

  // Reconnect the live stream after a dropped/failed socket connection
  const handleReconnect = () => {
    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
      showToast('Reconnecting to the live student stream…', 'info');
    }
  };

  // Transit Search Action
  const handleTransitSearch = async (rawQuery) => {
    const q = (rawQuery || '').trim();
    if (!q) return; // empty queries never reach the API
    // Avoid duplicate in-flight requests for the same query (double-submit)
    if (transitResource.status === 'loading' && transitParamsRef.current.q === q) return;
    setRecentSearches(rememberSearch(q));
    transitParamsRef.current = { q };
    const result = await transitResource.load();
    if (!result?.ok && result?.keptData) {
      showToast('Could not update results — showing the previous search results.', 'warning');
    }
  };

  // Re-run the current transit query (refresh button) with the same guards
  const handleTransitRefresh = async () => {
    if (!transitParamsRef.current.q || transitResource.status === 'loading') return;
    const result = await transitResource.load();
    if (!result?.ok && result?.keptData) {
      showToast('Could not update results — showing the previous search results.', 'warning');
    }
  };

  // Re-run a remembered search from the recent-search chips
  const handleSelectRecentSearch = (q) => {
    setTransitQuery(q);
    handleTransitSearch(q);
  };

  const handleClearRecentSearches = () => {
    setRecentSearches(clearRecentSearches());
    showToast('Recent searches cleared.', 'info');
  };

  // Hand a searched stop over to the planner (cross-screen hand-off)
  const handleUseAsOrigin = (place) => {
    setFormData((prev) => ({ ...prev, origin: place }));
    setActiveTab('planner');
    showToast(`Starting point set to "${place}". Press Plan Route to recalculate.`);
  };

  const handleUseAsDestination = (place) => {
    setFormData((prev) => ({ ...prev, destination: place }));
    setActiveTab('planner');
    showToast(`Destination set to "${place}". Press Plan Route to recalculate.`);
  };

  // Retry the last transit search (keeps the original query parameters)
  const handleTransitRetry = () => {
    if (!transitParamsRef.current.q) return;
    if (transitResource.status === 'loading') return; // already in flight
    transitResource.load();
  };

  // Feedback Action
  const handleFeedbackSubmit = async (feedbackData) => {
    await sendFeedback(feedbackData);
    showToast('Feedback recorded. Thank you!');
  };

  // Demo Reset (ref-guarded against duplicate submissions)
  const resetInFlightRef = useRef(false);
  const handleResetDemo = async () => {
    if (resetInFlightRef.current) return;
    resetInFlightRef.current = true;
    setIsResetting(true);
    try {
      await resetDemoState();
      await Promise.all([reportsResource.load(), groupsResource.load()]);
      await handlePlan(false);
      showToast('Hackathon demo reset to baseline state!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      resetInFlightRef.current = false;
      setIsResetting(false);
    }
  };

  // Render helper for active feature page
  const renderTabContent = () => {
    switch (activeTab) {
      case 'planner':
        return (
          <PlannerPage
            formData={formData}
            setFormData={setFormData}
            onPlan={() => handlePlan(false)}
            isPlanning={isLoading}
            planResult={planResult}
            selectedRouteId={selectedRouteId}
            setSelectedRouteId={setSelectedRouteId}
            onOpenFeedback={(recId) => {
              setFeedbackRecId(recId);
              setIsFeedbackModalOpen(true);
            }}
            reports={reports}
            onConfirm={handleConfirmReport}
            onContradict={handleContradictReport}
            onOpenCreateReport={() => setIsReportModalOpen(true)}
            isConnected={isConnected}
            isLoadingInitial={reportsResource.isLoading}
            loadError={reportsResource.loadError}
            onRetryLoad={reportsResource.load}
            isRefreshing={reportsResource.isRefreshing}
            onRefresh={handleRefreshReports}
          />
        );

      case 'together':
        return (
          <TravelTogetherPage
            groups={groups}
            onJoinGroup={handleJoinGroup}
            onOpenCreateGroup={() => setIsGroupModalOpen(true)}
            isLoading={groupsResource.isLoading}
            loadError={groupsResource.loadError}
            onRetryLoad={groupsResource.load}
            isRefreshing={groupsResource.isRefreshing}
            onRefresh={handleRefreshGroups}
          />
        );

      case 'feed':
        return (
          <LiveAlertsPage
            reports={reports}
            onConfirm={handleConfirmReport}
            onContradict={handleContradictReport}
            onOpenCreateReport={() => setIsReportModalOpen(true)}
            isConnected={isConnected}
            isConnectionLost={isConnectionLost}
            onReconnect={handleReconnect}
            isLoading={reportsResource.isLoading}
            loadError={reportsResource.loadError}
            onRetryLoad={reportsResource.load}
            isRefreshing={reportsResource.isRefreshing}
            onRefresh={handleRefreshReports}
          />
        );

      case 'transit':
        return (
          <TransitSearchPage
            query={transitQuery}
            onQueryChange={setTransitQuery}
            onSearch={handleTransitSearch}
            status={transitResource.status}
            result={transitResource.data}
            error={transitResource.error}
            onRetry={handleTransitRetry}
            onRefresh={handleTransitRefresh}
            recentSearches={recentSearches}
            onSelectRecent={handleSelectRecentSearch}
            onClearRecent={handleClearRecentSearches}
            onUseAsOrigin={handleUseAsOrigin}
            onUseAsDestination={handleUseAsDestination}
          />
        );

      default:
        return (
          <NotFound 
            message="Unknown View"
            onNavigateHome={() => setActiveTab('planner')}
          />
        );
    }
  };

  // Navbar props
  const navbarProps = {
    isConnected,
    onResetDemo: handleResetDemo,
    isResetting,
    activeTab,
    setActiveTab,
    reportsCount: reports.length
  };

  return (
    <>
      <MainLayout 
        navbarProps={navbarProps}
        sidebar={
          <MapView
            planResult={planResult}
            selectedRouteId={selectedRouteId}
            disruptionReports={reports}
          />
        }
      >
        {renderTabContent()}
      </MainLayout>

      {/* Floating Toast Message */}
      {toast && (
        <Toast message={toast.message} type={toast.type} />
      )}

      {/* Modals */}
      <CreateReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSubmit={handleCreateReport}
        isSubmitting={isSubmittingReport}
      />

      <CreateGroupModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        onSubmit={handleCreateGroup}
        isSubmitting={isSubmittingGroup}
      />

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={handleFeedbackSubmit}
        recommendationId={feedbackRecId}
      />
    </>
  );
}
