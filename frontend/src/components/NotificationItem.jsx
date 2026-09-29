import React from 'react';
import { Bell } from 'lucide-react';

function formatAge(report) {
  if (Number.isFinite(report?.ageMinutes)) {
    return report.ageMinutes < 1 ? 'Just now' : `${report.ageMinutes} min ago`;
  }
  return 'Recently';
}

export default function NotificationItem({ report }) {
  return (
    <article className="flex gap-3 p-4">
      <span className="mt-0.5 rounded-full bg-amber-500/10 p-2 text-amber-300" aria-hidden="true">
        <Bell className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-white">{report.area || 'Commute update'}</h2>
          <time className="text-xs text-slate-500">{formatAge(report)}</time>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{report.message}</p>
        {report.mode && <p className="mt-2 text-xs font-medium text-emerald-300">{report.mode}</p>}
      </div>
    </article>
  );
}