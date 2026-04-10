import { type ReactNode } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";
import { SuccessState } from "./SuccessState";

export interface EdgeStateViewProps {
  /** True while initial load or refetch */
  loading?: boolean;
  /** Error message; when set, error state is shown (and loading is ignored) */
  error?: string | null;
  /** True when data is loaded and list/result is empty */
  empty?: boolean;
  /** When true, success state is shown instead of children (e.g. after submit) */
  success?: boolean;
  /** Optional retry callback for error state */
  onRetry?: () => void;
  /** Content to render when not loading, no error, not empty, and not success */
  children: ReactNode;
  /** Override loading message */
  loadingMessage?: string;
  /** Taller loading area for full sections */
  loadingVariant?: "default" | "page";
  /** Override empty message */
  emptyMessage?: string;
  /** Message for success state */
  successMessage?: string;
  /** Optional action on success state */
  onSuccessAction?: () => void;
  successActionLabel?: string;
  /** Override retry label */
  retryLabel?: string;
  /** Pass false when offline to disable retry and show Offline */
  isOnline?: boolean;
  /** When empty, optional action (e.g. "Add item") */
  onEmptyAction?: () => void;
  /** Label for empty action button */
  emptyActionLabel?: string;
}

/**
 * Renders loading, error, empty, or success state, or children.
 * Use for list/detail pages that fetch data: loading → error | empty | content.
 */
export function EdgeStateView({
  loading = false,
  error = null,
  empty = false,
  success = false,
  onRetry,
  children,
  loadingMessage = "Loading…",
  loadingVariant = "default",
  emptyMessage = "No items found.",
  successMessage = "Done.",
  onSuccessAction,
  successActionLabel = "Continue",
  retryLabel = "Try again",
  isOnline = true,
  onEmptyAction,
  emptyActionLabel = "Try again",
}: EdgeStateViewProps) {
  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={onRetry}
        retryLabel={retryLabel}
        isOnline={isOnline}
      />
    );
  }

  if (loading) {
    return <LoadingSpinner message={loadingMessage} variant={loadingVariant} />;
  }

  if (success) {
    return (
      <SuccessState
        message={successMessage}
        onAction={onSuccessAction}
        actionLabel={successActionLabel}
      />
    );
  }

  if (empty) {
    return (
      <EmptyState
        message={emptyMessage}
        onAction={onEmptyAction ?? onRetry}
        actionLabel={emptyActionLabel}
        isOnline={isOnline}
      />
    );
  }

  return <>{children}</>;
}
