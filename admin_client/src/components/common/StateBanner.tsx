export type StateBannerVariant = "error" | "success" | "info" | "warning";

export interface StateBannerProps {
  variant: StateBannerVariant;
  message: string;
  /** Optional dismiss control */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Shown as secondary action (e.g. refetch) */
  onRetry?: () => void;
  retryLabel?: string;
}

export function StateBanner({
  variant,
  message,
  onDismiss,
  dismissLabel = "Dismiss",
  onRetry,
  retryLabel = "Try again",
}: StateBannerProps) {
  const role = variant === "error" || variant === "warning" ? "alert" : "status";

  return (
    <div className={`state-banner state-banner--${variant}`} role={role}>
      <p className="state-banner__message">{message}</p>
      {(onRetry || onDismiss) && (
        <div className="state-banner__actions">
          {onRetry ? (
            <button type="button" className="state-banner__btn" onClick={onRetry}>
              {retryLabel}
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" className="state-banner__btn" onClick={onDismiss}>
              {dismissLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
