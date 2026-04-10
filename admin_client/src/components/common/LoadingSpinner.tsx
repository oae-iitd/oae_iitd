export interface LoadingSpinnerProps {
  message?: string;
  size?: number;
  /** Taller block for full-page or panel loading */
  variant?: "default" | "page";
  className?: string;
}

export function LoadingSpinner({
  message = "Loading…",
  size = 40,
  variant = "default",
  className = "",
}: LoadingSpinnerProps) {
  const rootClass =
    `edge-state edge-state--loading ${variant === "page" ? "edge-state--page" : ""} ${className}`.trim();

  return (
    <div className={rootClass} role="status" aria-busy="true" aria-live="polite">
      <div
        className="edge-spinner edge-spinner--animated"
        style={{ width: size, height: size }}
        aria-hidden
      />
      {message ? <p className="edge-state__message">{message}</p> : null}
    </div>
  );
}
