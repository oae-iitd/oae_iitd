export interface EmptyStateProps {
  message: string;
  iconName?: "tray" | "inbox" | "doc" | "search";
  onAction?: () => void;
  actionLabel?: string;
  isOnline?: boolean;
}

const iconMap = {
  tray: "📭",
  inbox: "📥",
  doc: "📄",
  search: "🔍",
};

export function EmptyState({
  message,
  iconName = "tray",
  onAction,
  actionLabel = "Try again",
  isOnline = true,
}: EmptyStateProps) {
  const icon = iconMap[iconName] ?? iconMap.tray;

  return (
    <div className="edge-state edge-state--empty">
      <div className="edge-state__icon" aria-hidden>
        <span style={{ fontSize: "2.75rem" }} role="img" aria-label="">
          {icon}
        </span>
      </div>
      <p className="edge-state__message">{message}</p>
      {onAction ? (
        <button
          type="button"
          className="edge-state__action"
          onClick={onAction}
          disabled={!isOnline}
        >
          {isOnline ? actionLabel : "Offline"}
        </button>
      ) : null}
    </div>
  );
}
