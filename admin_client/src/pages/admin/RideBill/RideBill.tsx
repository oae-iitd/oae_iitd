import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../Users/Users.css";
import "./RideBill.css";
import httpClient from "../../../services/api/http";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import {
  rideBillsService,
  type RideBill as RideBillType,
} from "../../../services/ride-bills/ride-bills.service";
import {
  AnimatedNumber,
  EdgeStateView,
  EmptyState,
  StateBanner,
  useToast,
} from "../../../components/common";
import { formatDdMmYyTime, formatINR, printRideBillsPdf } from "./exportRideBills";


const PAGE_SIZE_OPTIONS: number[] = [
  ...Array.from({ length: 10 }, (_, i) => i + 1),
  20, 30, 40, 50, 60, 70, 80, 90, 100,
];

type TimeRange = "all" | "day" | "week" | "month" | "year" | "custom";

type RideBillListState = "loading" | "error" | "empty" | "idle";

const TIME_RANGE_PRESET_OPTIONS = [
  ["all", "All time"],
  ["day", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["year", "This year"],
] as const satisfies ReadonlyArray<readonly [Exclude<TimeRange, "custom">, string]>;

function formatDMMyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function formatDMMyyFromYmd(ymd: string): string {
  const parts = ymd.split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const [y, mo, da] = parts;
  return formatDMMyy(new Date(y, mo - 1, da));
}

function RideBillCalendarGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
    >
      <rect x="2.5" y="3.5" width="15" height="14" rx="2" />
      <line x1="6.5" y1="2" x2="6.5" y2="5" />
      <line x1="13.5" y1="2" x2="13.5" y2="5" />
      <line x1="2.5" y1="8" x2="17.5" y2="8" />
      <circle cx="6.5" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="15" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDayFromYmd(ymd: string): Date {
  const [y, mo, da] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(y, mo - 1, da, 0, 0, 0, 0);
}

function endOfLocalDayFromYmd(ymd: string): Date {
  const [y, mo, da] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(y, mo - 1, da, 23, 59, 59, 999);
}

/** Monday-start week (local). */
function startOfThisWeek(now: Date): Date {
  const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = s.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  s.setDate(s.getDate() + mondayOffset);
  s.setHours(0, 0, 0, 0);
  return s;
}

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

function getBillDriverId(bill: RideBillType): string | undefined {
  if (!bill.driver) return undefined;
  if (typeof bill.driver === "string") return bill.driver;
  return bill.driver._id;
}

function getDriverName(
  driverValue: string | { _id: string; name?: string } | undefined,
  driversList: Array<{ _id: string; name: string }>,
  cache: Record<string, string> = {},
): string {
  if (!driverValue) return "—";
  if (typeof driverValue === "object") {
    return driverValue.name || cache[driverValue._id] || "—";
  }
  const found = driversList.find((d) => d._id === driverValue);
  if (found) return found.name;
  return cache[driverValue] || "—";
}

function getPaginationItems(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  const tp = totalPages;
  const cp = currentPage;
  if (tp <= 5) return Array.from({ length: tp }, (_, i) => i + 1);
  if (cp <= 3) return [1, 2, 3, "ellipsis", tp];
  if (cp >= tp - 2) return [1, "ellipsis", tp - 2, tp - 1, tp];
  return [1, "ellipsis", cp - 1, cp, cp + 1, "ellipsis", tp];
}

function getStudentName(bill: RideBillType): string {
  if (typeof bill.userId === "object" && bill.userId) {
    const name = bill.userId.name || bill.userId.username || "Unknown";
    const entryNumber = bill.userId.enrollmentNumber || (bill.userId.username !== name ? bill.userId.username : undefined);
    if (entryNumber && entryNumber !== name) return `${name} (${entryNumber})`;
    return name;
  }
  if (typeof bill.userId === "string" && bill.userId) return `User #${bill.userId}`;
  return "—";
}

function getRideId(bill: RideBillType): string {
  if (bill.rideNumber) return bill.rideNumber;
  if (typeof bill.rideId === "object" && bill.rideId) return bill.rideId._id;
  if (typeof bill.rideId === "string" && bill.rideId) return bill.rideId;
  return bill._id.substring(0, 8).toUpperCase();
}

const SUCCESS_TOAST_MS = 4800;

const RideBill: React.FC = () => {
  const { showSuccess, showError } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [driverFilter, setDriverFilter] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [customDateFrom, setCustomDateFrom] = useState(() => localYmd(new Date()));
  const [customDateTo, setCustomDateTo] = useState(() => localYmd(new Date()));
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);
  const [calendarDraftStart, setCalendarDraftStart] = useState<Date | null>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [calendarDraftEnd, setCalendarDraftEnd] = useState<Date | null>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const calendarSheetRef = useRef<HTMLDivElement>(null);
  const [bills, setBills] = useState<RideBillType[]>([]);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [reasonSelections, setReasonSelections] = useState<Record<string, string>>({});
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({});
  const [driversCache, setDriversCache] = useState<Record<string, string>>({});

  useEffect(() => {
    httpClient
      .get<Array<{ _id: string; name?: string }>>(API_ENDPOINTS.DRIVERS.BASE)
      .then((res) => {
        const map: Record<string, string> = {};
        (res.data ?? []).forEach((d) => {
          if (d._id && d.name) map[d._id] = d.name;
        });
        setDriversCache(map);
      })
      .catch(() => {/* non-critical */});
  }, []);

  const fetchBills = useCallback(async () => {
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filterStatus !== "all") params.status = filterStatus;
      if (debouncedSearch) params.search = debouncedSearch;
      const data = await rideBillsService.getRideBills(params);
      setBills(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch ride bills:", err);
      setError(parseApiError(err, "Failed to load ride bills. Please try again."));
    } finally {
      setInitialFetchDone(true);
    }
  }, [filterStatus, debouncedSearch]);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    const delay = trimmed === "" ? 0 : 300;
    const id = window.setTimeout(() => setDebouncedSearch(trimmed), delay);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => {
    void fetchBills();
  }, [fetchBills]);

  useEffect(() => {
    const nextSel: Record<string, string> = {};
    const nextInp: Record<string, string> = {};
    for (const bill of bills) {
      if (!bill.reason) {
        nextSel[bill._id] = "";
        continue;
      }
      if (bill.reason === "route-change" || bill.reason === "system-error") {
        nextSel[bill._id] = bill.reason;
      } else {
        nextSel[bill._id] = "__custom__";
        nextInp[bill._id] = bill.reason;
      }
    }
    setReasonSelections(nextSel);
    setReasonInputs(nextInp);
  }, [bills]);

  useEffect(() => {
    if (!showCalendarSheet) return;
    const handler = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element) {
        if (t.closest(".react-datepicker-popper") || t.closest(".react-datepicker")) {
          return;
        }
      }
      if (calendarSheetRef.current && !calendarSheetRef.current.contains(t as Node)) {
        setShowCalendarSheet(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendarSheet]);

  useEffect(() => {
    if (!showCalendarSheet) return;
    if (timeRange === "custom" && customDateFrom && customDateTo) {
      setCalendarDraftStart(startOfLocalDayFromYmd(customDateFrom));
      setCalendarDraftEnd(startOfLocalDayFromYmd(customDateTo));
    } else {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      setCalendarDraftStart(t);
      setCalendarDraftEnd(new Date(t));
    }
  }, [showCalendarSheet, timeRange, customDateFrom, customDateTo]);

  const toggleCalendarSheet = useCallback(() => {
    setShowCalendarSheet((o) => !o);
  }, []);

  const handleStatusUpdate = async (id: string, newStatus: RideBillType["status"]) => {
    try {
      await rideBillsService.updateRideBill(id, { status: newStatus });
      showSuccess("Bill status updated.", SUCCESS_TOAST_MS);
      void fetchBills();
    } catch (err) {
      console.error("Failed to update ride bill:", err);
      showError(parseApiError(err, "Failed to update ride bill."));
    }
  };

  const handleReasonChange = async (billId: string, newReason: string) => {
    if (!newReason) {
      setReasonSelections((p) => ({ ...p, [billId]: "" }));
      return;
    }
    if (newReason === "__custom__") {
      setReasonSelections((p) => ({ ...p, [billId]: "__custom__" }));
      return;
    }
    try {
      await rideBillsService.updateRideBill(billId, { reason: newReason });
      showSuccess("Reason saved.", SUCCESS_TOAST_MS);
      setReasonSelections((p) => ({ ...p, [billId]: newReason }));
      setReasonInputs((p) => {
        const n = { ...p };
        delete n[billId];
        return n;
      });
      void fetchBills();
    } catch (err) {
      console.error("Failed to update reason:", err);
      showError(parseApiError(err, "Failed to update reason."));
    }
  };

  const handleReasonInputBlur = async (billId: string) => {
    const value = reasonInputs[billId]?.trim();
    if (!value) return;
    try {
      await rideBillsService.updateRideBill(billId, { reason: value });
      showSuccess("Reason saved.", SUCCESS_TOAST_MS);
      void fetchBills();
    } catch (err) {
      console.error("Failed to update reason text:", err);
      showError(parseApiError(err, "Failed to update reason."));
    }
  };

  const drivers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const bill of bills) {
      if (bill.driver && typeof bill.driver === "object" && bill.driver._id) {
        const name = bill.driver.name || driversCache[bill.driver._id] || "—";
        seen.set(bill.driver._id, name);
      } else if (bill.driver && typeof bill.driver === "string") {
        const name = driversCache[bill.driver];
        if (name) seen.set(bill.driver, name);
        else if (!seen.has(bill.driver)) seen.set(bill.driver, `Driver #${bill.driver}`);
      }
    }
    return Array.from(seen.entries()).map(([_id, name]) => ({ _id, name }));
  }, [bills, driversCache]);

  const filteredBills = useMemo(
    () =>
      bills.filter((bill) => {
        if (driverFilter && getBillDriverId(bill) !== driverFilter) return false;
        if (timeRange === "all") return true;
        const d = new Date(bill.createdAt);
        const now = new Date();
        if (timeRange === "day") {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          return d >= start;
        }
        if (timeRange === "week") {
          return d >= startOfThisWeek(now);
        }
        if (timeRange === "month") {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          return d >= startOfMonth;
        }
        if (timeRange === "year") {
          const startOfYear = new Date(now.getFullYear(), 0, 1);
          return d >= startOfYear;
        }
        const fromY = customDateFrom.trim();
        const toY = customDateTo.trim();
        if (!fromY || !toY) return false;
        const lo = fromY <= toY ? fromY : toY;
        const hi = fromY <= toY ? toY : fromY;
        const start = startOfLocalDayFromYmd(lo);
        const end = endOfLocalDayFromYmd(hi);
        return d >= start && d <= end;
      }),
    [bills, driverFilter, timeRange, customDateFrom, customDateTo],
  );

  const overview = useMemo(() => {
    let requested = 0;
    let arrived = 0;
    let inProgress = 0;
    let cancelled = 0;
    let completed = 0;
    let revenue = 0;
    for (const b of filteredBills) {
      const s = (b.status || "").toLowerCase();
      if (s === "requested") requested += 1;
      else if (s === "arrived") {
        arrived += 1;
        revenue += b.fare ?? 0;
      } else if (s === "in_progress") {
        inProgress += 1;
        revenue += b.fare ?? 0;
      } else if (s === "completed") {
        completed += 1;
        revenue += b.fare ?? 0;
      } else if (s === "cancelled") cancelled += 1;
    }
    return {
      total: filteredBills.length,
      requested,
      arrived,
      inProgress,
      cancelled,
      completed,
      revenue,
    };
  }, [filteredBills]);

  const exportRows = useMemo(
    () =>
      filteredBills.map((bill) => ({
        rideId: getRideId(bill),
        student: getStudentName(bill),
        driverName: getDriverName(bill.driver, drivers, driversCache),
        route: `${bill.fromLocation} → ${bill.toLocation}`,
        fare: formatINR(bill.fare ?? 0),
        fareAmount: bill.fare ?? 0,
        status: bill.status,
        date: formatDdMmYyTime(bill.createdAt),
        reason: bill.reason?.trim() ? bill.reason : "—",
      })),
    [filteredBills, drivers, driversCache],
  );

  const handleExportPdf = useCallback(() => {
    if (exportRows.length === 0) {
      showError("No bills to export for the current filters.");
      return;
    }
    try {
      printRideBillsPdf(exportRows);
    } catch {
      showError("Could not open the print window. Allow pop-ups to save as PDF.");
    }
  }, [exportRows, showError]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterStatus, driverFilter, timeRange, customDateFrom, customDateTo, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / pageSize));

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginatedBills = useMemo(
    () => filteredBills.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredBills, currentPage, pageSize],
  );

  const paginationItems = useMemo(
    () => getPaginationItems(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const listLoading = !initialFetchDone;
  const listFetchError = error && bills.length === 0 ? error : null;
  const listEmpty = initialFetchDone && !error && bills.length === 0;
  const listIdle = initialFetchDone && !listFetchError && !listEmpty;

  const listState: RideBillListState = listLoading
    ? "loading"
    : listFetchError
      ? "error"
      : listEmpty
        ? "empty"
        : "idle";

  return (
    <div
      className="users-page ride-bill-page"
      data-ride-bill-list-state={listState}
      aria-busy={listLoading ? true : undefined}
    >
      <EdgeStateView
        loading={listLoading}
        error={listFetchError}
        onRetry={() => void fetchBills()}
        retryLabel="Try again"
        loadingMessage="Loading ride bills…"
        loadingVariant="page"
        empty={listEmpty}
        emptyMessage="No ride bills yet. They appear when students book rides."
        onEmptyAction={() => void fetchBills()}
        emptyActionLabel="Try again"
      >
        <>
          {error && bills.length > 0 ? (
            <StateBanner
              variant="error"
              message={error}
              onRetry={() => void fetchBills()}
              retryLabel="Try again"
              onDismiss={() => setError(null)}
            />
          ) : null}

          {listIdle ? (
            <>
              <div className="recap-section" aria-label="Ride bills summary">
                <div className="recap-card">
                  <div className="recap-icon recap-icon--blue">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M6 2h5l3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                      <path d="M9 2v4h4M6 10h8M6 13h5" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Total</div>
                    <div className="recap-value">
                      <AnimatedNumber value={overview.total} />
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
                      aria-hidden
                    >
                      <path d="M2 14 7 9l4 4 7-7" />
                      <path d="M12 6h6v6" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Collected (paid)</div>
                    <div className="recap-value ride-bill-recap__currency">
                      <AnimatedNumber
                        value={overview.revenue}
                        integer={false}
                        format={(n) => formatINR(n)}
                      />
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
                      aria-hidden
                    >
                      <circle cx="10" cy="10" r="7" />
                      <path d="M10 6v4l3 2" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Requested</div>
                    <div className="recap-value">
                      <AnimatedNumber value={overview.requested} />
                    </div>
                  </div>
                </div>

                <div className="recap-card">
                  <div className="recap-icon recap-icon--green">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M10 2a6 6 0 0 1 6 6c0 4-6 10-6 10S4 12 4 8a6 6 0 0 1 6-6z" />
                      <circle cx="10" cy="8" r="2" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Arrived</div>
                    <div className="recap-value">
                      <AnimatedNumber value={overview.arrived} />
                    </div>
                  </div>
                </div>

                <div className="recap-card">
                  <div className="recap-icon recap-icon--indigo">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <circle cx="10" cy="10" r="7" />
                      <path d="M10 6v4l3 2" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">In Progress</div>
                    <div className="recap-value">
                      <AnimatedNumber value={overview.inProgress} />
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
                      aria-hidden
                    >
                      <path d="M10 2v4M10 14v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 10h4m8 0h4M4.93 15.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Completed</div>
                    <div className="recap-value">
                      <AnimatedNumber value={overview.completed} />
                    </div>
                  </div>
                </div>

                <div className="recap-card">
                  <div className="recap-icon recap-icon--red">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <circle cx="10" cy="10" r="7" />
                      <path d="m13 7-6 6M7 7l6 6" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Cancelled</div>
                    <div className="recap-value">
                      <AnimatedNumber value={overview.cancelled} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="page-header">
                <div className="ride-bill-toolbar" role="search">
                  <div className="ride-bill-segments ride-bill-toolbar__search-wrap">
                    <input
                      type="search"
                      className="ride-bill-toolbar__search"
                      placeholder="Search route, student, ride ID, driver…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      aria-label="Search ride bills"
                    />
                  </div>
                  <div className="ride-bill-toolbar__time-range">
                    <div className="ride-bill-segments" role="group" aria-label="Date range">
                      {TIME_RANGE_PRESET_OPTIONS.map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          className={`ride-bill-segments__btn ${timeRange === v ? "ride-bill-segments__btn--active" : ""}`}
                          onClick={() => {
                            setTimeRange(v);
                            setShowCalendarSheet(false);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                      <div className="ride-bill-calendar-container" ref={calendarSheetRef}>
                        <button
                          type="button"
                          className={`ride-bill-segments__btn ride-bill-segments__btn--calendar ${timeRange === "custom" ? "ride-bill-segments__btn--active" : ""}`}
                          onClick={toggleCalendarSheet}
                          aria-label="Custom date range"
                          title="Custom date range"
                          aria-expanded={showCalendarSheet}
                        >
                          <RideBillCalendarGlyph className="ride-bill-calendar-icon" />
                          {timeRange === "custom" && customDateFrom && customDateTo ? (
                            <span className="ride-bill-calendar-range-text">
                              {formatDMMyyFromYmd(customDateFrom)} – {formatDMMyyFromYmd(customDateTo)}
                            </span>
                          ) : null}
                        </button>
                        {showCalendarSheet ? (
                          <div className="ride-bill-calendar-dropdown">
                            <div className="ride-bill-calendar-header">
                              <h4 className="ride-bill-calendar-title">Select date range</h4>
                              <button
                                type="button"
                                className="ride-bill-calendar-close-btn"
                                onClick={() => setShowCalendarSheet(false)}
                                aria-label="Close calendar"
                              >
                                ×
                              </button>
                            </div>
                            <div className="ride-bill-calendar-inputs">
                              <div className="ride-bill-date-input-group">
                                <label htmlFor="ride-bill-calendar-start">Start date</label>
                                <DatePicker
                                  id="ride-bill-calendar-start"
                                  selected={calendarDraftStart}
                                  onChange={(date: Date | null) => {
                                    setCalendarDraftStart(date);
                                    if (date && calendarDraftEnd && date > calendarDraftEnd) {
                                      setCalendarDraftEnd(date);
                                    }
                                  }}
                                  selectsStart
                                  startDate={calendarDraftStart}
                                  endDate={calendarDraftEnd}
                                  maxDate={calendarDraftEnd ?? new Date()}
                                  dateFormat="MMM dd, yyyy"
                                  className="ride-bill-date-picker-input"
                                  placeholderText="Select start date"
                                  isClearable
                                  showYearDropdown
                                  showMonthDropdown
                                  dropdownMode="select"
                                />
                              </div>
                              <div className="ride-bill-date-input-group">
                                <label htmlFor="ride-bill-calendar-end">End date</label>
                                <DatePicker
                                  id="ride-bill-calendar-end"
                                  selected={calendarDraftEnd}
                                  onChange={(date: Date | null) => {
                                    setCalendarDraftEnd(date);
                                    if (date && calendarDraftStart && date < calendarDraftStart) {
                                      setCalendarDraftStart(date);
                                    }
                                  }}
                                  selectsEnd
                                  startDate={calendarDraftStart}
                                  endDate={calendarDraftEnd}
                                  minDate={calendarDraftStart ?? undefined}
                                  maxDate={new Date()}
                                  dateFormat="MMM dd, yyyy"
                                  className="ride-bill-date-picker-input"
                                  placeholderText="Select end date"
                                  isClearable
                                  showYearDropdown
                                  showMonthDropdown
                                  dropdownMode="select"
                                />
                              </div>
                            </div>
                            {calendarDraftStart && calendarDraftEnd ? (
                              <div
                                className={`ride-bill-date-range-info ${calendarDraftStart > calendarDraftEnd ? "ride-bill-date-range-info--error" : ""}`}
                              >
                                <span className="ride-bill-date-range-text">
                                  {calendarDraftStart > calendarDraftEnd ? (
                                    <span className="ride-bill-date-range-error">
                                      Start date must be on or before end date
                                    </span>
                                  ) : (
                                    `${Math.ceil((calendarDraftEnd.getTime() - calendarDraftStart.getTime()) / 86400000) + 1} days selected`
                                  )}
                                </span>
                              </div>
                            ) : null}
                            <div className="ride-bill-calendar-actions">
                              <button
                                type="button"
                                className="ride-bill-calendar-cancel-btn"
                                onClick={() => setShowCalendarSheet(false)}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="ride-bill-calendar-apply-btn"
                                disabled={
                                  !calendarDraftStart ||
                                  !calendarDraftEnd ||
                                  calendarDraftStart > calendarDraftEnd
                                }
                                onClick={() => {
                                  if (
                                    !calendarDraftStart ||
                                    !calendarDraftEnd ||
                                    calendarDraftStart > calendarDraftEnd
                                  ) {
                                    return;
                                  }
                                  setCustomDateFrom(localYmd(calendarDraftStart));
                                  setCustomDateTo(localYmd(calendarDraftEnd));
                                  setTimeRange("custom");
                                  setShowCalendarSheet(false);
                                }}
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="ride-bill-segments ride-bill-toolbar__select-wrap ride-bill-toolbar__select-wrap--driver">
                    <select
                      className="ride-bill-toolbar__select"
                      value={driverFilter}
                      onChange={(e) => setDriverFilter(e.target.value)}
                      aria-label="Filter by driver"
                    >
                      <option value="">All drivers</option>
                      {drivers
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="ride-bill-segments ride-bill-toolbar__select-wrap">
                    <select
                      className="ride-bill-toolbar__select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      aria-label="Filter by bill status"
                    >
                      <option value="all">All statuses</option>
                      <option value="requested">Requested</option>
                      <option value="arrived">Arrived</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="ride-bill-segments ride-bill-toolbar__export-wrap">
                    <button
                      type="button"
                      className="ride-bill-segments__btn"
                      onClick={handleExportPdf}
                      disabled={exportRows.length === 0}
                      title="Opens print dialog — choose Save as PDF"
                      aria-label="Export PDF"
                    >
                      PDF
                    </button>
                  </div>
                </div>
              </div>

              <div className="users-table-container">
                {filteredBills.length === 0 ? (
                  <EmptyState
                    message="No bills match your filters."
                    iconName="search"
                    onAction={() => {
                      setSearchTerm("");
                      setDebouncedSearch("");
                      setDriverFilter("");
                      setTimeRange("all");
                      const t = localYmd(new Date());
                      setCustomDateFrom(t);
                      setCustomDateTo(t);
                      setShowCalendarSheet(false);
                      setFilterStatus("all");
                    }}
                    actionLabel="Clear filters"
                  />
                ) : (
                  <table className="users-table ride-bills-table">
                    <thead>
                      <tr>
                        <th>Ride</th>
                        <th>Student</th>
                        <th>Driver</th>
                        <th>Route</th>
                        <th>Fare</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedBills.map((bill) => (
                        <tr key={bill._id}>
                          <td className="ride-bills-table__mono">{getRideId(bill)}</td>
                          <td>{getStudentName(bill)}</td>
                          <td>{getDriverName(bill.driver, drivers, driversCache)}</td>
                          <td className="ride-bills-table__route">
                            <span
                              className="ride-bills-table__route-line"
                              title={`${bill.fromLocation} → ${bill.toLocation}`}
                            >
                              <span>{bill.fromLocation}</span>
                              <span className="ride-bills-table__route-arrow" aria-hidden>
                                →
                              </span>
                              <span>{bill.toLocation}</span>
                            </span>
                          </td>
                          <td className="ride-bills-table__fare">{formatINR(bill.fare ?? 0)}</td>
                          <td>
                            <select
                              value={bill.status}
                              onChange={(e) =>
                                handleStatusUpdate(
                                  bill._id,
                                  e.target.value as RideBillType["status"],
                                )
                              }
                              className={`ride-bill-status-select status-${bill.status}`}
                              aria-label={`Status for bill ${getRideId(bill)}`}
                            >
                              <option value="requested">Requested</option>
                              <option value="arrived">Arrived</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </td>
                          <td className="ride-bills-table__muted ride-bills-table__date-cell">
                            {(() => {
                              const parts = formatDdMmYyTime(bill.createdAt).split(", ");
                              return (
                                <>
                                  <span>{parts[0]}</span>
                                  <span>{parts[1]}</span>
                                </>
                              );
                            })()}
                          </td>
                          <td className="ride-bills-table__reason">
                            <select
                              className="filter-select ride-bill-reason-select"
                              value={reasonSelections[bill._id] ?? ""}
                              onChange={(e) => void handleReasonChange(bill._id, e.target.value)}
                              aria-label="Bill reason"
                            >
                              <option value="">Reason…</option>
                              <option value="route-change">Route changed</option>
                              <option value="system-error">System error</option>
                              <option value="__custom__">Custom…</option>
                            </select>
                            {reasonSelections[bill._id] === "__custom__" ? (
                              <input
                                type="text"
                                className="ride-bill-reason-input"
                                placeholder="Enter reason, then blur or Enter"
                                value={reasonInputs[bill._id] ?? ""}
                                onChange={(e) =>
                                  setReasonInputs((p) => ({ ...p, [bill._id]: e.target.value }))
                                }
                                onBlur={() => void handleReasonInputBlur(bill._id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleReasonInputBlur(bill._id);
                                  }
                                }}
                              />
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {filteredBills.length > 0 ? (
                <div className="users-pagination" role="navigation" aria-label="Ride bills pagination">
                  <div className="users-pagination__size">
                    <label htmlFor="ride-bills-page-size">Rows per page</label>
                    <select
                      id="ride-bills-page-size"
                      className="filter-select users-pagination__size-select"
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="users-pagination__nav">
                    <button
                      type="button"
                      className="pagination-btn"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>
                    {paginationItems.map((item, idx) => {
                      if (item === "ellipsis") {
                        return (
                          <span key={`e-${idx}`} className="pagination-ellipsis" aria-hidden>
                            …
                          </span>
                        );
                      }
                      const page = item;
                      return (
                        <button
                          key={page}
                          type="button"
                          className={`pagination-btn ${page === currentPage ? "active" : ""}`}
                          onClick={() => setCurrentPage(page)}
                          aria-current={page === currentPage ? "page" : undefined}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="pagination-btn"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      </EdgeStateView>
    </div>
  );
};

export default RideBill;
