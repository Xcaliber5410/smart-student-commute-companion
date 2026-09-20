import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Spinner - Reusable loading spinner component
 * 
 * A flexible loading spinner with multiple sizes and variants.
 * 
 * @param {Object} props
 * @param {'sm' | 'md' | 'lg' | 'xl'} props.size - Spinner size
 * @param {'primary' | 'white' | 'muted'} props.variant - Color variant
 * @param {string} props.label - Accessible label for screen readers
 * @param {boolean} props.center - Center spinner in container
 * @param {string} props.className - Additional CSS classes
 * 
 * @example
 * <Spinner size="lg" label="Loading data..." />
 * 
 * <Spinner size="sm" variant="white" />
 */
export default function Spinner({
  size = 'md',
  variant = 'primary',
  label = 'Loading...',
  center = false,
  className = '',
}) {
  // Size classes
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };
  
  // Color variants
  const variants = {
    primary: 'text-emerald-400',
    white: 'text-white',
    muted: 'text-slate-400',
  };
  
  // Container styles
  const containerStyles = center ? 'flex items-center justify-center' : '';
  
  // Spinner styles
  const spinnerStyles = `${sizes[size]} ${variants[variant]} animate-spin ${className}`;
  
  return (
    <div className={containerStyles} role="status" aria-live="polite">
      <Loader2 className={spinnerStyles} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
