import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Button - Reusable button component
 * 
 * A flexible button component supporting multiple variants, sizes, and states.
 * Includes loading state, disabled state, and full keyboard accessibility.
 * 
 * @param {Object} props
 * @param {'primary' | 'secondary' | 'ghost' | 'danger'} props.variant - Button style variant
 * @param {'sm' | 'md' | 'lg'} props.size - Button size
 * @param {boolean} props.loading - Show loading spinner
 * @param {boolean} props.disabled - Disable button
 * @param {boolean} props.fullWidth - Make button full width
 * @param {React.ReactNode} props.children - Button content
 * @param {React.ReactNode} props.icon - Optional icon (left side)
 * @param {string} props.className - Additional CSS classes
 * @param {Function} props.onClick - Click handler
 * @param {string} props.type - Button type (button, submit, reset)
 * @param {Object} props.rest - Other button props
 * 
 * @example
 * <Button variant="primary" onClick={handleClick}>
 *   Click Me
 * </Button>
 * 
 * <Button variant="danger" loading icon={<TrashIcon />}>
 *   Delete
 * </Button>
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  children,
  icon,
  className = '',
  onClick,
  type = 'button',
  ...rest
}) {
  // Base styles
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed';
  
  // Variant styles
  const variants = {
    primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 focus:ring-emerald-500 active:scale-95',
    secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 focus:ring-emerald-500 active:scale-95',
    ghost: 'text-slate-300 hover:text-white hover:bg-slate-800/50 focus:ring-emerald-500',
    danger: 'bg-rose-500 text-white hover:bg-rose-400 focus:ring-rose-500 active:scale-95',
  };
  
  // Size styles
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2.5 text-sm rounded-xl',
    lg: 'px-6 py-3 text-base rounded-xl',
  };
  
  // Width styles
  const widthStyles = fullWidth ? 'w-full' : '';
  
  // Combine all styles
  const buttonStyles = `${baseStyles} ${variants[variant]} ${sizes[size]} ${widthStyles} ${className}`;
  
  // Handle disabled state
  const isDisabled = disabled || loading;
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading || undefined}
      className={buttonStyles}
      {...rest}
    >
      {loading && (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading…</span>
        </>
      )}
      {!loading && icon && <span className="shrink-0" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
