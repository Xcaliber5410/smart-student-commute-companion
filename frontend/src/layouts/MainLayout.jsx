import React from 'react';
import Navbar from '../components/Navbar';
import AppShell from './AppShell';

/**
 * MainLayout - Primary application layout
 * 
 * Provides the main structure for the application including:
 * - Responsive Navbar at the top
 * - Main content area with responsive grid
 * - Interactive sidebar (map/preview)
 * - Accessible skip link and semantic footer
 * 
 * Built on top of the reusable AppShell foundation.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Main content to render
 * @param {React.ReactNode} [props.sidebar] - Sidebar content (typically MapView)
 * @param {Object} [props.navbarProps] - Props to pass to Navbar component
 * @param {'split'|'single'|'centered'} [props.layoutMode='split'] - Layout presentation mode
 * @param {boolean} [props.fullWidth=false] - Whether content spans full width
 * @param {string} [props.className=''] - Additional CSS classes
 */
export default function MainLayout({ 
  children, 
  sidebar, 
  navbarProps = {},
  layoutMode = 'split',
  fullWidth = false,
  className = ''
}) {
  return (
    <AppShell
      header={<Navbar {...navbarProps} />}
      sidebar={sidebar}
      layoutMode={layoutMode}
      fullWidth={fullWidth}
      className={className}
    >
      {children}
    </AppShell>
  );
}
