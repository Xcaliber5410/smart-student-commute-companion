import React, { useState, useEffect } from 'react';
import MainLayout from './layouts/MainLayout';
import Toast from './components/Toast';
import NotFound from './components/NotFound';
import MapView from './components/MapView';
import CreateReportModal from './components/CreateReportModal';
import CreateGroupModal from './components/CreateGroupModal';
import FeedbackModal from './components/FeedbackModal';
import { PlannerPage, TravelTogetherPage, LiveAlertsPage } from './pages';
import { 
  planCommute, 
  fetchLiveReports, 
  postLiveReport, 
  confirmReport, 
  contradictReport, 
  fetchRideGroups, 
  postRideGroup, 
  joinRideGroup, 
  submitFeedback, 
  resetDemoState 
} from './services/api';
import { getSocket } from './services/socket';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('planner');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState(null);
  const [isResetting, setIsResetting] = useState(false);
  const [toast, setToast] = useState(null);

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

  // Live Reports State
  const [reports, setReports] = useState([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Travel Together State
  const [groups, setGroups] = useState([]);
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
    // 1. Fetch initial reports and ride groups
    loadInitialData();

    // 2. Setup Socket.IO
    const socket = getSocket();

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join_commute_channel', { area: 'mumbai_general' });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('live_report_created', (newReport) => {
      setReports((prev) => [newReport, ...prev.filter(r => r.id !== newReport.id)]);
      showToast(`⚠ Live Report from ${newReport.area}: ${newReport.message.substring(0, 50)}...`, 'warning');
    });

    socket.on('live_report_updated', (updatedReport) => {
      setReports((prev) => prev.map(r => r.id === updatedReport.id ? { ...r, ...updatedReport } : r));
    });

    socket.on('live_report_expired', ({ id }) => {
      setReports((prev) => prev.filter(r => r.id !== id));
    });

    socket.on('demo_reset', ({ freshReports }) => {
      if (freshReports) setReports(freshReports);
      loadRideGroups();
      showToast('Demo environment reset successfully', 'info');
    });

    // 3. Auto-plan default commute on first load
    handlePlan(true);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('live_report_created');
      socket.off('live_report_updated');
      socket.off('live_report_expired');
      socket.off('demo_reset');
    };
  }, []);

  const loadInitialData = async () => {
    setIsInitialLoading(true);
    setInitialLoadError(null);
    try {
      const reportsRes = await fetchLiveReports();
      if (reportsRes.success) setReports(reportsRes.reports);
      const groupsLoaded = await loadRideGroups();
      if (!groupsLoaded) {
        setInitialLoadError('Some live updates could not be loaded. Please try again.');
      }
    } catch (err) {
      // User-friendly error surfaced through the page ErrorState (no technical details)
      setInitialLoadError(
        'Unable to load live student updates. Please check your connection and try again.'
      );
    } finally {
      setIsInitialLoading(false);
    }
  };

  const loadRideGroups = async () => {
    try {
      const groupsRes = await fetchRideGroups();
      if (groupsRes.success) setGroups(groupsRes.groups);
      return groupsRes.success;
    } catch (err) {
      console.warn('Ride groups load:', err.message);
      return false;
    }
  };

  // Execute Commute Planning
  const handlePlan = async (isInitial = false) => {
    setIsLoading(true);
    try {
      const data = await planCommute(formData);
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
      setIsLoading(false);
    }
  };

  // Live Report Actions
  const handleCreateReport = async (reportData) => {
    setIsSubmittingReport(true);
    try {
      await postLiveReport(reportData);
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
      await confirmReport(id);
      showToast('Thank you! Marked report as still active.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleContradictReport = async (id) => {
    try {
      await contradictReport(id);
      showToast('Thank you! Noted that disruption has cleared.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Travel Together Actions
  const handleCreateGroup = async (groupData) => {
    setIsSubmittingGroup(true);
    try {
      await postRideGroup(groupData);
      setIsGroupModalOpen(false);
      await loadRideGroups();
      showToast('Commute coordination group created!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmittingGroup(false);
    }
  };

  const handleJoinGroup = async (groupId) => {
    try {
      await joinRideGroup(groupId);
      await loadRideGroups();
      showToast('Successfully joined commute group!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Feedback Action
  const handleFeedbackSubmit = async (feedbackData) => {
    await submitFeedback(feedbackData);
    showToast('Feedback recorded. Thank you!');
  };

  // Demo Reset
  const handleResetDemo = async () => {
    setIsResetting(true);
    try {
      await resetDemoState();
      await loadInitialData();
      await handlePlan(false);
      showToast('Hackathon demo reset to baseline state!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
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
            isLoadingInitial={isInitialLoading}
            loadError={initialLoadError}
            onRetryLoad={loadInitialData}
          />
        );

      case 'together':
        return (
          <TravelTogetherPage
            groups={groups}
            onJoinGroup={handleJoinGroup}
            onOpenCreateGroup={() => setIsGroupModalOpen(true)}
            isLoading={isInitialLoading}
            loadError={initialLoadError}
            onRetryLoad={loadInitialData}
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
            isLoading={isInitialLoading}
            loadError={initialLoadError}
            onRetryLoad={loadInitialData}
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
