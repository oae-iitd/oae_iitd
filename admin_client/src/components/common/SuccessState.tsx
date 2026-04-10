export interface SuccessStateProps {
  message: string;
  /** Optional primary action (e.g. continue, view details) */
  onAction?: () => void;
  actionLabel?: string;
  showIcon?: boolean;
}

export function SuccessState({
  message,
  onAction,
  actionLabel = "Continue",
  showIcon = true,
}: SuccessStateProps) {
  return (
    <div className="edge-state edge-state--success" role="status">
      {showIcon && (
        <div className="edge-state__icon" aria-hidden>
          <span style={{ fontSize: "2.75rem" }} role="img" aria-label="">
            ✓
          </span>
        </div>
      )}
      <p className="edge-state__message">{message}</p>
      {onAction ? (
        <button type="button" className="edge-state__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
