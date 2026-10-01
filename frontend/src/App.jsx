import React, { useState, useEffect, useRef } from 'react';
import MainLayout from './layouts/MainLayout';
import Toast from './components/Toast';
import NotFound from './components/NotFound';
import MapView from './components/MapView';
import CreateReportModal from './components/CreateReportModal';
import CreateGroupModal from './components/CreateGroupModal';
import FeedbackModal from './components/FeedbackModal';
import PreferencesDialog from './components/PreferencesDialog';
import PwaStatusBanner from './components/PwaStatusBanner';
import { PlannerPage, MyCommutesPage, TravelTogetherPage, LiveAlertsPage, TransitSearchPage, NotificationsPage, DeviceAlertsPage } from './pages';
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
import {
  readRecentSearches,
  rememberSearch,
  clearRecentSearches,
  readAppPreferences,
  writeAppPreferences,
  resetAppPreferences,
  readSavedCommutes,
  saveCommute,
  removeSavedCommute,
  commuteSignature,
  isCommuteSaved,
} from './utils/uiPreferences';
import { resetDemoState } from './services/api';
import {
  getPermission as getDeviceAlertPermission,
  requestPermission as requestDeviceAlertPermission,
  watchPermission as watchDeviceAlertPermission,
  showNotification as showDeviceNotification,
} from './services/deviceAlerts';
import { getSocket } from './services/socket';
import useAsyncResource from './hooks/useAsyncResource';
import usePwaInstall from './hooks/usePwaInstall';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('planner');
  const [isConnected, setIsConnected] = useState(false);
  // True only AFTER a live-stream disconnect/connect failure (never on first paint)
  const [isConnectionLost, setIsConnectionLost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Toast queue — capped so rapid events never bury the screen; each entry
  // owns its auto-dismiss timer so overlapping toasts can't cancel each other
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef(new Map());
  const nextToastIdRef = useRef(1);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
  };

  const showToast = (message, type = 'success') => {
    const id = nextToastIdRef.current++;
    // Keep the newest three notifications; older ones drop off automatically
    setToasts((prev) => [...prev, { id, message, type }].slice(-3));
    // Errors linger longer — failures need time to read and act on
    const duration = type === 'error' ? 6000 : 3500;
    const timer = setTimeout(() => dismissToast(id), duration);
    toastTimersRef.current.set(id, timer);
  };

  // Clear any pending toast timers on unmount
  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

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

  // Client-side personalization preferences (device-local, no backend sync)
  const [appPreferences, setAppPreferences] = useState(() => readAppPreferences());

  // Day 7 — Device Alerts: browser notification permission state.
  // Starts as 'loading' and resolves on mount (covers browsers where the
  // Notification API is missing — the service reports 'unsupported').
  const [deviceAlertPermission, setDeviceAlertPermission] = useState('loading');
  const [isPermissionRequestPending, setIsPermissionRequestPending] = useState(false);
  const [isSendingTestAlert, setIsSendingTestAlert] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  // PWA status — connectivity + pending service-worker update
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();

  // Browser connectivity transitions (online/offline events)
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      showToast('You are offline — live data is unavailable until you reconnect.', 'warning');
    };
    const handleOnline = () => {
      setIsOffline(false);
      showToast('Back online — live data is available again.', 'success');
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Service-worker update flow (registerSW.js dispatches this event)
  useEffect(() => {
    const handleSwUpdate = () => setSwUpdateAvailable(true);
    window.addEventListener('swUpdateAvailable', handleSwUpdate);
    return () => window.removeEventListener('swUpdateAvailable', handleSwUpdate);
  }, []);

  const handleApplyUpdate = () => window.location.reload();

  // Day 7 — resolve permission state on mount and keep it live when the user
  // changes it in browser site settings (feature-detected; no-op when unsupported)
  useEffect(() => {
    setDeviceAlertPermission(getDeviceAlertPermission());
    const stopWatching = watchDeviceAlertPermission(setDeviceAlertPermission);
    return stopWatching;
  }, []);

  const handleInstallApp = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      showToast('Thanks! The app is being installed on your device.', 'success');
    } else if (outcome === 'dismissed') {
      showToast('Install dismissed — you can add the app from your browser menu anytime.', 'info');
    }
  };

  // Apply a partial preference change with immediate UI feedback
  const handlePreferenceChange = (overrides) => {
    const next = writeAppPreferences(overrides);
    setAppPreferences(next);
    const [key, value] = Object.entries(overrides)[0] || [];
    const labels = {
      showDashboardOverview: `Dashboard overview ${next.showDashboardOverview ? 'shown' : 'hidden'}`,
      liveReportToasts: `Live report notifications ${next.liveReportToasts ? 'enabled' : 'muted'}`,
      deviceAlerts: `Device alerts ${next.deviceAlerts ? 'enabled' : 'disabled'}`,
    };
    showToast(labels[key] || 'Preference updated.', 'info');
  };

  // Day 7 — request browser notification permission (must run inside a user gesture)
  const handleRequestDevicePermission = async () => {
    if (isPermissionRequestPending) return;
    setIsPermissionRequestPending(true);
    try {
      const resolved = await requestDeviceAlertPermission();
      setDeviceAlertPermission(resolved);
      if (resolved === 'granted') {
        showToast('Device alerts enabled for this browser.', 'success');
      } else if (resolved === 'denied') {
        showToast('Notifications are blocked — allow them in your browser site settings.', 'error');
      } else if (resolved === 'unsupported') {
        showToast('This browser does not support device alerts.', 'error');
      } else {
        showToast('Permission request dismissed — you can enable device alerts anytime.', 'info');
      }
    } catch {
      showToast('The browser could not complete the permission request. Try again.', 'error');
    } finally {
      setIsPermissionRequestPending(false);
    }
  };

  // Day 7 — fire a local test notification (granted permission required)
  const handleSendTestAlert = async () => {
    setIsSendingTestAlert(true);
    try {
      const shown = await showDeviceNotification({
        title: 'Test device alert',
        body: 'Device alerts are working. Live disruption reports will appear like this while the app is in the background.',
        tag: 'device-alert-test',
      });
      if (shown) {
        showToast('Test alert shown on this device.', 'success');
      } else if (getDeviceAlertPermission() === 'unsupported') {
        showToast('This browser does not support device alerts.', 'error');
      } else if (getDeviceAlertPermission() !== 'granted') {
        showToast('Allow notifications before sending a test alert.', 'error');
      } else {
        showToast('This browser blocked the test notification.', 'error');
      }
    } finally {
      setIsSendingTestAlert(false);
    }
  };

  const handlePreferenceReset = () => {
    setAppPreferences(resetAppPreferences());
    showToast('Preferences restored to defaults.', 'info');
  };

  // My Commutes — on-device saved commute list (loads/reloads from storage)
  const savedCommutesResource = useAsyncResource(
    () => readSavedCommutes(),
    { errorMessage: 'Unable to load saved commutes from this device. Check that site storage is allowed and try again.' }
  );

  const reports = reportsResource.data || [];
  const groups = groupsResource.data || [];
  const savedCommutes = savedCommutesResource.data || [];

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

  // (showToast/dismissToast are defined with the toast queue above)

  // Initial Data & Socket Setup
  useEffect(() => {
    // 1. Fetch initial reports and ride groups (each resource guards against stale responses)
    reportsResource.load();
    groupsResource.load();
    savedCommutesResource.load();

    // 2. Setup Socket.IO
    const socket = getSocket();

    socket.on('connect', () => {
      setIsConnected(true);
      setIsConnectionLost(false);
      socket.emit('join_commute_channel', { area: 'mumbai_general' });
    });

    socket.on('disconnect', () => {
      setIsConnected((wasConnected) => {
        // Only notify on a real transition — never on first paint or repeats
        if (wasConnected) showToast('Live updates disconnected — reconnecting automatically.', 'warning');
        return false;
      });
      setIsConnectionLost(true);
    });

    socket.on('connect_error', () => {
      setIsConnected(false);
      setIsConnectionLost(true);
    });

    socket.on('live_report_created', (newReport) => {
      reportsResource.setData((prev) => [newReport, ...(prev || []).filter(r => r.id !== newReport.id)]);
      // Respect the user's notification preference (read fresh each event)
      if (readAppPreferences().liveReportToasts) {
        showToast(`⚠ Live Report from ${newReport.area}: ${newReport.message.substring(0, 50)}...`, 'warning');
      }
      // Day 7 — mirror the report as an OS-level alert, but only while the
      // app is NOT focused (no duplicate noise while actively using it).
      // Preferences are read fresh because this handler outlives renders.
      const prefs = readAppPreferences();
      if (prefs.deviceAlerts && !document.hasFocus() && getDeviceAlertPermission() === 'granted') {
        showDeviceNotification({
          title: `Live report — ${newReport.area}`,
          body: newReport.message,
          tag: `live-report-${newReport.id}`,
        });
      }
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
  // `setupOverride` plans an explicit setup (e.g. from My Commutes) without
  // waiting for the planner form state to re-render.
  const planInFlightRef = useRef(false);
  const handlePlan = async (isInitial = false, setupOverride = null) => {
    if (planInFlightRef.current) return; // ignore duplicate submissions
    planInFlightRef.current = true;
    setIsLoading(true);
    try {
      const data = await requestPlan(setupOverride || formData);
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

  // Dashboard recent-search chip: jump to Transit Search and run the query
  const handleDashboardRecentSearch = (q) => {
    setActiveTab('transit');
    handleSelectRecentSearch(q);
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

  // ─── My Commutes (saved commute setups, stored on this device) ───────────
  const currentCommuteSignature = commuteSignature(formData);
  const isCurrentCommuteSaved = isCommuteSaved(savedCommutes, formData);

  // Persist the current planner setup (duplicates collapse by signature)
  const handleSaveCommute = () => {
    try {
      const next = saveCommute(formData);
      savedCommutesResource.setData(next);
      showToast('Commute saved to My Commutes.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRemoveSavedCommute = (id) => {
    try {
      const next = removeSavedCommute(id);
      savedCommutesResource.setData(next);
      showToast('Saved commute removed.', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Load a saved setup into the planner and run it immediately
  const handlePlanCommute = async (commute) => {
    if (planInFlightRef.current) return; // a plan request is already running
    const setup = {
      origin: commute.origin,
      destination: commute.destination,
      desiredArrivalTime: commute.desiredArrivalTime,
      preferredModes: commute.preferredModes,
      preference: commute.preference,
      walkingToleranceMinutes: commute.walkingToleranceMinutes,
      maxBudgetRupees: commute.maxBudgetRupees,
    };
    setFormData((prev) => ({ ...prev, ...setup }));
    setActiveTab('planner');
    showToast(`Loaded ${commute.origin} → ${commute.destination} into the planner.`, 'info');
    await handlePlan(false, setup);
  };

  // Re-read saved commutes from storage (e.g. after changes in another tab)
  const handleRefreshSavedCommutes = async () => {
    const result = await savedCommutesResource.load();
    if (!result?.ok && result?.keptData) {
      showToast('Could not re-read saved commutes — showing the loaded list.', 'warning');
    }
    return result;
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
            onSaveCommute={handleSaveCommute}
            isCommuteSaved={isCurrentCommuteSaved}
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
            savedCommutesCount={savedCommutes.length}
            groupsCount={groups.length}
            recentSearches={recentSearches}
            onSelectRecent={handleDashboardRecentSearch}
            onNavigate={setActiveTab}
            showDashboardOverview={appPreferences.showDashboardOverview}
          />
        );

      case 'mycommutes':
        return (
          <MyCommutesPage
            commutes={savedCommutes}
            isLoading={savedCommutesResource.isLoading}
            loadError={savedCommutesResource.loadError}
            onRetryLoad={savedCommutesResource.load}
            isRefreshing={savedCommutesResource.isRefreshing}
            onRefresh={handleRefreshSavedCommutes}
            onPlanCommute={handlePlanCommute}
            onRemoveCommute={handleRemoveSavedCommute}
            isPlanning={isLoading}
            activeSignature={currentCommuteSignature}
            onNavigateToPlanner={() => setActiveTab('planner')}
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

      case 'notifications':
        return (
          <NotificationsPage
            reports={reports}
            isLoading={reportsResource.isLoading}
            loadError={reportsResource.loadError}
            onRetryLoad={reportsResource.load}
            isRefreshing={reportsResource.isRefreshing}
            onRefresh={handleRefreshReports}
            isConnectionLost={isConnectionLost}
            onReconnect={handleReconnect}
          />
        );

      case 'devicealerts':
        return (
          <DeviceAlertsPage
            permission={deviceAlertPermission}
            isPermissionPending={isPermissionRequestPending}
            onRequestPermission={handleRequestDevicePermission}
            isLiveSyncConnected={isConnected}
            isEnabled={appPreferences.deviceAlerts}
            onToggleEnabled={(value) => handlePreferenceChange({ deviceAlerts: value })}
            onSendTestAlert={handleSendTestAlert}
            isSendingTest={isSendingTestAlert}
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
    reportsCount: reports.length,
    onOpenPreferences: () => setIsPreferencesOpen(true),
    canInstall: canInstall && !isInstalled,
    onInstallApp: handleInstallApp
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
        <PwaStatusBanner
          isOffline={isOffline}
          updateAvailable={swUpdateAvailable}
          onRefresh={handleApplyUpdate}
        />
        {renderTabContent()}
      </MainLayout>

      {/* Floating notification region (dismissible queue) */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Client-side personalization controls */}
      <PreferencesDialog
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        preferences={appPreferences}
        onChange={handlePreferenceChange}
        onReset={handlePreferenceReset}
      />

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
