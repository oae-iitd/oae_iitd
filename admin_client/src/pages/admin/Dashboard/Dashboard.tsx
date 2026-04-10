import React, { useState, useEffect, useCallback, useRef } from "react";
import httpClient from "../../../services/api/http";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { userService, type User } from "../../../services/user/user.service";
import { rideBillsService } from "../../../services/ride-bills/ride-bills.service";
import type { RideBill } from "../../../services/ride-bills/ride-bills.service";
import { ridesService } from "../../../services/rides/rides.service";
import "../Users/Users.css";
import "./Dashboard.css";
import { AnimatedNumber, EdgeStateView } from "../../../components/common";

function parseApiError(err: unknown, fallback: string): string {
  const ax = err as {
    response?: {
      status?: number;
      data?: { error?: string; message?: string; details?: string };
    };
  };
  if (ax?.response?.status === 401 || ax?.response?.status === 403) {
    return "Unauthorized. Please log in with an Admin account.";
  }
  const d = ax?.response?.data;
  return (
    d?.message ||
    d?.error ||
    d?.details ||
    (err instanceof Error ? err.message : fallback)
  );
}

function useIsOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

type DashboardPhase = "idle" | "loading" | "error" | "empty" | "success";

type DriverRow = { _id: string; name: string };

interface DashboardStats {
  totalUsers: number;
  totalBills: number;
  totalRevenue: number;
  totalRideRoutes: number;
  pendingBills: number;
  activeBills: number;
  completedBills: number;
  cancelledBills: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}

function resolveUserName(userId: RideBill["userId"]): string {
  if (!userId) return "Unknown";
  if (typeof userId === "object") return userId.name || "User";
  return "User";
}

function resolveDriverDisplayName(
  driver: RideBill["driver"],
  idToName: Record<string, string>,
): string | null {
  if (!driver) return null;
  if (typeof driver === "object") return driver.name || null;
  const s = driver.trim();
  if (s.length === 0) return null;
  return idToName[s] ?? null;
}

function buildDriverNameMap(
  users: User[],
  driversPayload: DriverRow[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const u of users) {
    if (u.role?.toLowerCase() === "driver" && u._id) {
      const n = u.name?.trim() ?? "";
      if (n) map[u._id] = n;
    }
  }
  for (const d of driversPayload) {
    if (d._id && d.name) map[d._id] = d.name;
  }
  return map;
}

function formatBillStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "requested": return "Requested";
    case "arrived": return "Arrived";
    case "in_progress": return "In Progress";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return status;
  }
}

const ACTIVITY_LIMIT = 5;
const ACTIVITY_MAX = 50;
const BILL_STATUS_BAR_MS = 580;

const BILL_STATUS_SEGMENTS: {
  segClass: string;
  label: string;
  statKey: keyof Pick<
    DashboardStats,
    "activeBills" | "pendingBills" | "completedBills" | "cancelledBills"
  >;
}[] = [
  { segClass: "seg-active", statKey: "activeBills", label: "Active" },
  { segClass: "seg-pending", statKey: "pendingBills", label: "Requested" },
  { segClass: "seg-completed", statKey: "completedBills", label: "Completed" },
  { segClass: "seg-cancelled", statKey: "cancelledBills", label: "Cancelled" },
];

function countRideBillStatuses(bills: RideBill[]): {
  pending: number;
  completed: number;
  active: number;
  cancelled: number;
} {
  const out = { pending: 0, completed: 0, active: 0, cancelled: 0 };
  for (const b of bills) {
    const s = (b.status ?? "").toString().toLowerCase().trim();
    if (s === "requested") out.pending += 1;
    else if (s === "completed") out.completed += 1;
    else if (s === "arrived" || s === "in_progress") out.active += 1;
    else if (s === "cancelled") out.cancelled += 1;
  }
  return out;
}

const Dashboard: React.FC = () => {
  const isOnline = useIsOnline();
  const fetchGen = useRef(0);

  const [phase, setPhase] = useState<DashboardPhase>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalBills: 0,
    totalRevenue: 0,
    totalRideRoutes: 0,
    pendingBills: 0,
    activeBills: 0,
    completedBills: 0,
    cancelledBills: 0,
  });
  const [recentBills, setRecentBills] = useState<RideBill[]>([]);
  const [visibleActivityCount, setVisibleActivityCount] =
    useState(ACTIVITY_LIMIT);
  const [driverNameById, setDriverNameById] = useState<Record<string, string>>(
    {},
  );

  const loadDashboard = useCallback(async () => {
    const gen = ++fetchGen.current;
    setPhase("loading");
    setLoadError(null);
    try {
      const [users, billsStats, rideRoutes, bills, driversRes] =
        await Promise.all([
          userService.getUsers(),
          rideBillsService.getStatistics(),
          ridesService.getRides(),
          rideBillsService.getRideBills(),
          httpClient
            .get<DriverRow[]>(API_ENDPOINTS.DRIVERS.BASE)
            .catch((): { data: DriverRow[] } => ({ data: [] })),
        ]);
      if (gen !== fetchGen.current) return;

      setDriverNameById(buildDriverNameMap(users, driversRes.data ?? []));

      const sorted = [...bills].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const fromList = countRideBillStatuses(sorted);
      const useList = sorted.length > 0;

      setStats({
        totalUsers: users.length,
        totalBills: useList ? sorted.length : billsStats.totalBills || 0,
        totalRevenue: billsStats.totalRevenue || 0,
        totalRideRoutes: rideRoutes.length,
        pendingBills: useList ? fromList.pending : billsStats.pendingBills || 0,
        activeBills: useList ? fromList.active : billsStats.activeBills || 0,
        completedBills: useList
          ? fromList.completed
          : billsStats.completedBills || 0,
        cancelledBills: useList
          ? fromList.cancelled
          : billsStats.cancelledBills || 0,
      });

      setRecentBills(sorted.slice(0, ACTIVITY_MAX));
      setVisibleActivityCount(ACTIVITY_LIMIT);
      setPhase(sorted.length === 0 ? "empty" : "success");
    } catch (e) {
      console.error("Failed to load dashboard:", e);
      if (gen !== fetchGen.current) return;
      setLoadError(
        parseApiError(e, "Failed to load dashboard. Please try again."),
      );
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDashboard();
    });
  }, [loadDashboard]);

  const isLoading = phase === "idle" || phase === "loading";
  const billSegWidth = (n: number) =>
    stats.totalBills > 0 ? `${(n / stats.totalBills) * 100}%` : "0%";
  const visibleRecentBills = recentBills.slice(0, visibleActivityCount);

  return (
    <div
      className="users-page dashboard-page"
      data-dashboard-phase={phase}
      aria-busy={isLoading || undefined}
    >
      <EdgeStateView
        loading={isLoading}
        error={phase === "error" ? loadError : null}
        onRetry={() => void loadDashboard()}
        retryLabel="Try again"
        loadingMessage="Loading dashboard…"
        loadingVariant="page"
        isOnline={isOnline}
      >
        <div className="recap-section" aria-label="Dashboard summary">
          <div className="recap-card">
            <div className="recap-icon recap-icon--blue">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="10" cy="6.5" r="2.5" />
                <path d="M4 17c0-2.8 2.7-5 6-5s6 2.2 6 5" />
              </svg>
            </div>
            <div className="recap-body">
              <div className="recap-label">Total users</div>
              <div className="recap-value">
                {isLoading ? "…" : <AnimatedNumber value={stats.totalUsers} />}
              </div>
            </div>
          </div>

          <div className="recap-card">
            <div className="recap-icon recap-icon--orange">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 2h5l3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                <path d="M9 2v4h4M6 10h8M6 13h5" />
              </svg>
            </div>
            <div className="recap-body">
              <div className="recap-label">Total bills</div>
              <div className="recap-value">
                {isLoading ? "…" : <AnimatedNumber value={stats.totalBills} />}
              </div>
            </div>
          </div>

          <div className="recap-card">
            <div className="recap-icon recap-icon--teal">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 14 7 9l4 4 7-7" />
                <path d="M12 6h6v6" />
              </svg>
            </div>
            <div className="recap-body">
              <div className="recap-label">Total Collected (Paid)</div>
              <div className="recap-value dashboard-recap__currency">
                {isLoading ? (
                  "…"
                ) : (
                  <AnimatedNumber
                    value={stats.totalRevenue}
                    integer={false}
                    format={(n) =>
                      `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                    }
                  />
                )}
              </div>
            </div>
          </div>

          <div className="recap-card">
            <div className="recap-icon recap-icon--purple">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 2a6 6 0 0 1 6 6c0 4-6 10-6 10S4 12 4 8a6 6 0 0 1 6-6z" />
                <circle cx="10" cy="8" r="2" />
              </svg>
            </div>
            <div className="recap-body">
              <div className="recap-label">Ride routes</div>
              <div className="recap-value">
                {isLoading ? (
                  "…"
                ) : (
                  <AnimatedNumber value={stats.totalRideRoutes} />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h3 className="db-card-title">Bill Status</h3>

            <div className="status-bar-wrap" aria-label="Bill status breakdown">
              <div
                className="status-bar"
                style={
                  {
                    "--bill-bar-ms": `${BILL_STATUS_BAR_MS}ms`,
                  } as React.CSSProperties
                }
              >
                {!isLoading &&
                  stats.totalBills > 0 &&
                  BILL_STATUS_SEGMENTS.map(({ segClass, statKey, label }) => {
                    const count = stats[statKey];
                    return (
                      <div
                        key={statKey}
                        className={`status-bar-seg ${segClass}`}
                        style={{
                          flexGrow: 0,
                          flexShrink: 0,
                          flexBasis: billSegWidth(count),
                        }}
                        title={`${label}: ${count}`}
                      >
                        <div className="status-bar-seg__fill" />
                      </div>
                    );
                  })}
                {(isLoading || stats.totalBills === 0) && (
                  <div
                    className="status-bar-seg seg-empty"
                    style={{ width: "100%" }}
                  />
                )}
              </div>
              <div className="status-bar-legend">
                <span className="sbl-dot sbl-active" />
                <span className="sbl-label">Active</span>
                <span className="sbl-dot sbl-pending" />
                <span className="sbl-label">Requested</span>
                <span className="sbl-dot sbl-completed" />
                <span className="sbl-label">Completed</span>
                <span className="sbl-dot sbl-cancelled" />
                <span className="sbl-label">Cancelled</span>
              </div>
            </div>

            <div className="status-chips">
              <div className="status-chip chip-active">
                <span className="chip-count">
                  {isLoading ? "…" : <AnimatedNumber value={stats.activeBills} />}
                </span>
                <span className="chip-label">Active</span>
              </div>
              <div className="status-chip chip-pending">
                <span className="chip-count">
                  {isLoading ? (
                    "…"
                  ) : (
                    <AnimatedNumber value={stats.pendingBills} />
                  )}
                </span>
                <span className="chip-label">Requested</span>
              </div>
              <div className="status-chip chip-completed">
                <span className="chip-count">
                  {isLoading ? (
                    "…"
                  ) : (
                    <AnimatedNumber value={stats.completedBills} />
                  )}
                </span>
                <span className="chip-label">Completed</span>
              </div>
              <div className="status-chip chip-cancelled">
                <span className="chip-count">
                  {isLoading ? (
                    "…"
                  ) : (
                    <AnimatedNumber value={stats.cancelledBills} />
                  )}
                </span>
                <span className="chip-label">Cancelled</span>
              </div>
            </div>
          </div>

          <div className="dashboard-card">
            <h3 className="db-card-title">Summary</h3>
            <div className="summary-list">
              <div className="summary-item">
                <div className="summary-icon-wrap summary-icon-wrap--orange">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="2" y="4" width="16" height="13" rx="2" />
                    <path d="M6 4V3M14 4V3M2 9h16" />
                    <circle
                      cx="7"
                      cy="13"
                      r="0.8"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="10"
                      cy="13"
                      r="0.8"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="13"
                      cy="13"
                      r="0.8"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                </div>
                <div className="summary-item-body">
                  <span className="summary-item-label">Average Bill</span>
                  <span className="summary-item-value">
                    {isLoading ? (
                      "…"
                    ) : (
                      <AnimatedNumber
                        value={
                          stats.totalBills > 0
                            ? stats.totalRevenue / stats.totalBills
                            : 0
                        }
                        integer={false}
                        format={(n) =>
                          `₹${n.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        }
                      />
                    )}
                  </span>
                </div>
              </div>

              <div className="summary-item">
                <div className="summary-icon-wrap summary-icon-wrap--amber">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="10" cy="10" r="8" />
                    <path d="M10 6v4l2.5 2.5" />
                  </svg>
                </div>
                <div className="summary-item-body">
                  <span className="summary-item-label">Requested Bills</span>
                  <span className="summary-item-value summary-pending">
                    {isLoading ? (
                      "…"
                    ) : (
                      <AnimatedNumber value={stats.pendingBills} />
                    )}
                  </span>
                </div>
              </div>

              <div className="summary-item">
                <div className="summary-icon-wrap summary-icon-wrap--teal">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8z" />
                    <path d="M7 10l2 2 4-4" strokeWidth="1.8" />
                  </svg>
                </div>
                <div className="summary-item-body">
                  <span className="summary-item-label">Active Bills</span>
                  <span className="summary-item-value summary-paid">
                    {isLoading ? (
                      "…"
                    ) : (
                      <AnimatedNumber value={stats.activeBills} />
                    )}
                  </span>
                </div>
              </div>

              <div className="summary-item">
                <div className="summary-icon-wrap summary-icon-wrap--blue">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10 2v4M10 14v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 10h4m8 0h4M4.93 15.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                  </svg>
                </div>
                <div className="summary-item-body">
                  <span className="summary-item-label">Completed Bills</span>
                  <span className="summary-item-value summary-completed">
                    {isLoading ? (
                      "…"
                    ) : (
                      <AnimatedNumber value={stats.completedBills} />
                    )}
                  </span>
                </div>
              </div>

              <div className="summary-item">
                <div className="summary-icon-wrap summary-icon-wrap--red">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10 2a8 8 0 1 1 0 16A8 8 0 0 1 10 2z" />
                    <path d="M7 7l6 6M13 7l-6 6" strokeWidth="1.8" />
                  </svg>
                </div>
                <div className="summary-item-body">
                  <span className="summary-item-label">Cancelled Bills</span>
                  <span className="summary-item-value summary-cancelled">
                    {isLoading ? (
                      "…"
                    ) : (
                      <AnimatedNumber value={stats.cancelledBills} />
                    )}
                  </span>
                </div>
              </div>

              <div className="summary-item">
                <div className="summary-icon-wrap summary-icon-wrap--orange">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 2h5l3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                    <path d="M9 2v4h4M6 10h8M6 13h5" />
                  </svg>
                </div>
                <div className="summary-item-body">
                  <span className="summary-item-label">Ride bills</span>
                  <span className="summary-item-value">
                    {isLoading ? (
                      "…"
                    ) : (
                      <AnimatedNumber value={stats.totalBills} />
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-card activity-card">
          <div className="activity-header">
            <h3 className="db-card-title activity-header__title">
              Recent Activity
            </h3>
            <span className="activity-count-badge">
              {isLoading ? "…" : `${visibleRecentBills.length} latest`}
            </span>
          </div>

          <div className="activity-timeline">
            {isLoading &&
              Array.from({ length: ACTIVITY_LIMIT }, (_, i) => (
                <div key={i} className="activity-row activity-skeleton">
                  <div className="act-dot-col">
                    <div className="act-skeleton-dot" />
                  </div>
                  <div className="act-body">
                    <div className="act-skeleton-line act-skeleton-wide" />
                    <div className="act-skeleton-line act-skeleton-narrow" />
                  </div>
                  <div className="act-skeleton-line act-skeleton-time" />
                </div>
              ))}

            {!isLoading && recentBills.length === 0 ? (
              <div className="activity-empty">
                No bill activity yet. Bills will show here once rides are
                recorded.
              </div>
            ) : null}

            {!isLoading &&
              visibleRecentBills.map((bill, idx) => {
                const userName = resolveUserName(bill.userId);
                const driverName = resolveDriverDisplayName(
                  bill.driver,
                  driverNameById,
                );
                const isLast = idx === visibleRecentBills.length - 1;

                return (
                  <div
                    key={bill._id}
                    className={`activity-row${isLast ? " activity-row-last" : ""}`}
                  >
                    <div className="act-dot-col">
                      <span
                        className={`act-dot act-dot-${bill.status}`}
                        aria-label={formatBillStatus(bill.status)}
                      />
                      {!isLast && <span className="act-spine" />}
                    </div>

                    <div className="act-body">
                      <div className="act-route">
                        <span className="act-location">
                          {bill.fromLocation}
                        </span>
                        <svg
                          className="act-arrow"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M3 8h10M9 4l4 4-4 4" />
                        </svg>
                        <span className="act-location">{bill.toLocation}</span>
                      </div>
                      <div className="act-meta">
                        {bill.rideNumber ? (
                          <span className="act-ride-no">
                            #{bill.rideNumber}
                          </span>
                        ) : null}
                        <div className="act-meta-bottom">
                          <span className="act-user">{userName}</span>
                          {driverName ? (
                            <span className="act-driver">{driverName}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="act-right">
                      <span className="act-fare">
                        ₹{(bill.fare ?? 0).toLocaleString("en-IN")}
                      </span>
                      <span className={`act-badge act-badge-${bill.status}`}>
                        {formatBillStatus(bill.status)}
                      </span>
                      <span className="act-time">
                        {timeAgo(bill.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            {!isLoading && recentBills.length > visibleActivityCount ? (
              <button
                type="button"
                className="activity-read-more-btn"
                onClick={() =>
                  setVisibleActivityCount((prev) =>
                    Math.min(prev + ACTIVITY_LIMIT, recentBills.length),
                  )
                }
              >
                Read more...
              </button>
            ) : null}
          </div>
        </div>
      </EdgeStateView>
    </div>
  );
};

export default Dashboard;
