import React from 'react';
import Navbar from '../components/Navbar';

/**
 * MainLayout - Primary application layout
 * 
 * Provides the main structure for the application including:
 * - Sticky navbar at the top
 * - Main content area with responsive grid
 * - Footer with attribution
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Main content to render
 * @param {React.ReactNode} props.sidebar - Sidebar content (typically map)
 * @param {Object} props.navbarProps - Props to pass to Navbar component
 */
export default function MainLayout({ children, sidebar, navbarProps }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Navbar */}
      <Navbar {...navbarProps} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Primary Content (7 Cols on desktop) */}
          <div className="lg:col-span-7 space-y-6">
            {children}
          </div>

          {/* Right Column: Sidebar/Map (5 Cols on desktop) */}
          {sidebar && (
            <div className="lg:col-span-5 lg:sticky lg:top-24 h-[550px] lg:h-[calc(100vh-140px)]">
              {sidebar}
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 text-center text-xs text-slate-400 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Smart Student Commute Companion • Mumbai Hackathon MVP</span>
          <span>OpenStreetMap &amp; Leaflet (No Mapbox) • OSRM Routing • Mumbai GTFS • Open-Meteo • Gemini 3.8 Flash</span>
        </div>
      </footer>
    </div>
  );
}
