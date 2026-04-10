export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  isOnline?: boolean;
  showIcon?: boolean;
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "Try again",
  isOnline = true,
  showIcon = true,
}: ErrorStateProps) {
  return (
    <div className="edge-state edge-state--error" role="alert">
      {showIcon && (
        <div className="edge-state__icon" aria-hidden>
          <span style={{ fontSize: "2.75rem" }} role="img" aria-label="">
            ⚠️
          </span>
        </div>
      )}
      <p className="edge-state__message">{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="edge-state__retry"
          onClick={onRetry}
          disabled={!isOnline}
        >
          {isOnline ? retryLabel : "Offline"}
        </button>
      ) : null}
    </div>
  );
}
