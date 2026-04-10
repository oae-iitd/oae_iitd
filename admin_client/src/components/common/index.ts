/**
 * Shared UI primitives for async flows:
 * - Loading / error / empty / full-panel success — `EdgeStateView` (+ `LoadingSpinner`, `ErrorState`, `EmptyState`, `SuccessState`).
 * - Success / error / info as inline banners — `StateBanner`.
 * - Idle (ready content) — pass as `EdgeStateView` children (see `pages/public/Home/Home.tsx`).
 */

export { ToastProvider } from './ToastProvider';
export { useToast } from './useToast';
export { ToastItem, type Toast, type ToastType } from './Toast';

export { LoadingSpinner, type LoadingSpinnerProps } from './LoadingSpinner';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { SuccessState, type SuccessStateProps } from './SuccessState';
export { StateBanner, type StateBannerProps, type StateBannerVariant } from './StateBanner';
export { EdgeStateView, type EdgeStateViewProps } from './EdgeStateView';

export { AnimatedNumber, type AnimatedNumberProps } from './AnimatedNumber';

