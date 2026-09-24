import React from 'react';

/**
 * Skeleton - Base shimmer loading placeholder
 * 
 * @param {Object} props
 * @param {'text'|'circular'|'rectangular'|'rounded'} [props.variant='rounded'] - Shape variant
 * @param {string} [props.width] - Optional CSS width
 * @param {string} [props.height] - Optional CSS height
 * @param {string} [props.className=''] - Additional CSS classes
 */
export function Skeleton({
  variant = 'rounded',
  width,
  height,
  className = ''
}) {
  const variantClasses = {
    text: 'h-3.5 w-full rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-xl'
  };

  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div
      aria-hidden="true"
      style={style}
      className={`animate-pulse bg-slate-800/70 border border-slate-700/30 ${variantClasses[variant]} ${className}`}
    />
  );
}

/**
 * CardSkeleton - Reusable skeleton placeholder for transit/route cards
 */
export function CardSkeleton({ count = 1 }) {
  return (
    <div className="space-y-3.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div 
          key={idx} 
          className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-lg animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" className="w-10 h-10" />
              <div className="space-y-1.5">
                <Skeleton variant="text" className="w-36 h-4" />
                <Skeleton variant="text" className="w-24 h-3" />
              </div>
            </div>
            <Skeleton variant="rounded" className="w-20 h-6" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Skeleton variant="rounded" className="h-12 w-full" />
            <Skeleton variant="rounded" className="h-12 w-full" />
            <Skeleton variant="rounded" className="h-12 w-full" />
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800/60">
            <Skeleton variant="text" className="w-full h-3" />
            <Skeleton variant="text" className="w-4/5 h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
