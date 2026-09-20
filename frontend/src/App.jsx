import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import PlannerForm from './components/PlannerForm';
import RouteResults from './components/RouteResults';
import MapView from './components/MapView';
import LiveStudentFeed from './components/LiveStudentFeed';
import TravelTogether from './components/TravelTogether';
import CreateReportModal from './components/CreateReportModal';
import CreateGroupModal from './components/CreateGroupModal';
import FeedbackModal from './components/FeedbackModal';
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
    try {
      const reportsRes = await fetchLiveReports();
      if (reportsRes.success) setReports(reportsRes.reports);
      await loadRideGroups();
    } catch (err) {
      console.warn('Initial data load:', err.message);
    }
  };

  const loadRideGroups = async () => {
    try {
      const groupsRes = await fetchRideGroups();
      if (groupsRes.success) setGroups(groupsRes.groups);
    } catch (err) {
      console.warn('Ride groups load:', err.message);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Navbar */}
      <Navbar 
        isConnected={isConnected} 
        onResetDemo={handleResetDemo} 
        isResetting={isResetting}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        reportsCount={reports.length}
      />

      {/* Floating Toast Message */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[3000] max-w-sm animate-fade-in">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-semibold ${
            toast.type === 'error' 
              ? 'bg-rose-950/90 border-rose-500 text-rose-200' 
              : (toast.type === 'warning' ? 'bg-amber-950/90 border-amber-500 text-amber-200' : 'bg-emerald-950/90 border-emerald-500 text-emerald-200')
          }`}>
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Planner / Travel Together / Live Feed (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {activeTab === 'planner' && (
              <>
                <PlannerForm
                  formData={formData}
                  setFormData={setFormData}
                  onPlan={() => handlePlan(false)}
                  isLoading={isLoading}
                />

                <RouteResults
                  planResult={planResult}
                  selectedRouteId={selectedRouteId}
                  setSelectedRouteId={setSelectedRouteId}
                  onOpenFeedback={(recId) => {
                    setFeedbackRecId(recId);
                    setIsFeedbackModalOpen(true);
                  }}
                />

                {/* Quick Live Stream Section embedded below planner */}
                <div className="pt-2">
                  <LiveStudentFeed
                    reports={reports}
                    onConfirm={handleConfirmReport}
                    onContradict={handleContradictReport}
                    onOpenCreateReport={() => setIsReportModalOpen(true)}
                    isConnected={isConnected}
                  />
                </div>
              </>
            )}

            {activeTab === 'together' && (
              <TravelTogether
                groups={groups}
                onJoinGroup={handleJoinGroup}
                onOpenCreateGroup={() => setIsGroupModalOpen(true)}
              />
            )}

            {activeTab === 'feed' && (
              <LiveStudentFeed
                reports={reports}
                onConfirm={handleConfirmReport}
                onContradict={handleContradictReport}
                onOpenCreateReport={() => setIsReportModalOpen(true)}
                isConnected={isConnected}
              />
            )}
          </div>

          {/* Right Column: Sticky Leaflet Map (5 Cols) */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 h-[550px] lg:h-[calc(100vh-140px)]">
            <MapView
              planResult={planResult}
              selectedRouteId={selectedRouteId}
              disruptionReports={reports}
            />
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 text-center text-xs text-slate-400 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Smart Student Commute Companion • Mumbai Hackathon MVP</span>
          <span>OpenStreetMap &amp; Leaflet (No Mapbox) • OSRM Routing • Mumbai GTFS • Open-Meteo • Gemini 3.8 Flash</span>
        </div>
      </footer>

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
    </div>
  );
}
