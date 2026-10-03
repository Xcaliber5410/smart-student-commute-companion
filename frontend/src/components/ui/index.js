/**
 * UI Components Library
 * 
 * Barrel export for all reusable UI components.
 * Import from this file to ensure consistency across the app.
 * 
 * @example
 * import { Button, Input, Card, EmptyState, LoadingState, ErrorState, SuccessState, Skeleton } from '@/components/ui';
 */

export { default as Button } from './Button';
export { default as Input } from './Input';
export { default as Select } from './Select';
export { default as Textarea } from './Textarea';
export { default as Spinner } from './Spinner';
export { default as Alert } from './Alert';
export { default as EmptyState } from './EmptyState';
export { default as Card } from './Card';
export { default as FormField } from './FormField';

// Reusable Page States
export { default as LoadingState } from './LoadingState';
export { default as ErrorState } from './ErrorState';
export { default as SuccessState } from './SuccessState';
export { default as Skeleton, CardSkeleton } from './Skeleton';

// Reusable Data Display Components
export { default as Badge } from './Badge';
export { default as DataCard } from './DataCard';
export { default as MetaRow, MetaList } from './MetaRow';

// Reusable Search / Filter / Sort Controls
export { default as SearchInput } from './SearchInput';
export { default as FilterBar, FilterChip } from './FilterBar';

// Reusable Accessible Inputs (Day 7)
export { default as Toggle } from './Toggle';

// Reusable Install & Share Components (Day 8)
export { default as ShareableCard } from './ShareableCard';
export { default as InstallStatusCard } from './InstallStatusCard';

// Reusable Dialog & Confirmation Patterns
export { default as Modal } from './Modal';
export { default as ConfirmDialog } from './ConfirmDialog';

// Reusable View Switching, Summary & Loading Components (Day 4)
export { default as Tabs, TabPanel } from './Tabs';
export { default as StatTile } from './StatTile';
export { default as ListSkeleton } from './ListSkeleton';

// Reusable Progress & Data Visualization Components (Day 5)
export { default as ProgressBar } from './ProgressBar';
export { default as ComparisonBars } from './ComparisonBars';

// Reusable Promotional & Benefit-explainer Components (Day 9)
export { default as FeatureHighlight } from './FeatureHighlight';
export { default as InstallPromoDialog } from './InstallPromoDialog';

// Reusable Analytics Event Log (Day 10)
export { default as EventLogList } from './EventLogList';

// Reusable Offline Queue Row (Day 11)
export { default as QueueReportItem } from './QueueReportItem';
