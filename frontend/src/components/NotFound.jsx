import React from 'react';
import { AlertTriangle, Home } from 'lucide-react';

/**
 * NotFound - 404 / Unknown Route Component
 * 
 * Displays a user-friendly message when:
 * - User navigates to an unknown tab/route
 * - Content is not available
 * 
 * @param {Object} props
 * @param {Function} props.onNavigateHome - Callback to navigate back to home/planner
 * @param {string} props.message - Optional custom message
 */
export default function NotFound({ onNavigateHome, message }) {
  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-8 shadow-xl backdrop-blur-sm text-center">
      <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>
        
        <div>
          <h2 className="text-xl font-extrabold text-white mb-2">
            {message || 'Page Not Found'}
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            The view you're looking for doesn't exist or isn't available yet.
          </p>
        </div>

        {onNavigateHome && (
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
          >
            <Home className="w-4 h-4" />
            <span>Go to Planner</span>
          </button>
        )}
      </div>
    </div>
  );
}
