import React, { useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import httpClient from "../../../services/api/http";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { userService, type User } from "../../../services/user/user.service";
import ViewUserModal from "../../../components/admin/ViewUserModal";
import { AnimatedNumber, EdgeStateView, EmptyState, StateBanner } from "../../../components/common";
import "../Users/Users.css";
import "../RideBill/RideBill.css";
import "./Registrations.css";
import { formatDdMmYyTime } from "../RideBill/exportRideBills";

const PAGE_SIZE_OPTIONS: number[] = [
  ...Array.from({ length: 10 }, (_, i) => i + 1),
  20, 30, 40, 50, 60, 70, 80, 90, 100,
];

const STATUS_FILTER_OPTIONS = [
  ["all", "All"],
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
] as const satisfies ReadonlyArray<
  readonly ["all" | "pending" | "approved" | "rejected", string]
>;

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromYmd(ymd: string): Date | null {
  const parts = ymd.split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, mo, da] = parts;
  return new Date(y, mo - 1, da, 12, 0, 0, 0);
}

function parseApiError(err: unknown, fallback: string): string {
  const ax = err as { response?: { status?: number; data?: { error?: string } } };
  if (ax?.response?.status === 401 || ax?.response?.status === 403) {
    return "Unauthorized. Please login with an Admin account.";
  }
  return ax?.response?.data?.error ?? (err instanceof Error ? err.message : fallback);
}

function useIsOnline(): boolean {
  const [online, setOnline] = useState(
    () => (typeof navigator !== "undefined" ? navigator.onLine : true),
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

type RegistrationRow = {
  id: number;
  email: string;
  name: string;
  phone: string;
  enrollmentNumber: string;
  programme: string;
  course: string;
  year: string;
  approvalStatus: string;
  approvalReason: string;
  createdAt: string;
};

type PageItem = number | "ellipsis";

const Registrations: React.FC = () => {
  const isOnline = useIsOnline();
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [viewRow, setViewRow] = useState<RegistrationRow | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<number | null>(null);
  const [actionKey, setActionKey] = useState(0);
  const [reviewModal, setReviewModal] = useState<{
    id: number;
    action: "approved" | "rejected";
  } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  /** YYYY-MM-DD — required when approving */
  const [reviewExpiryDate, setReviewExpiryDate] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const expiryMinDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const fetchRows = async () => {
    setLoading(true);
    setError("");
    setSuccessBanner(null);
    try {
      const response = await httpClient.get<RegistrationRow[]>(
        API_ENDPOINTS.REGISTRATIONS.STUDENTS,
      );
      const data = response.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(parseApiError(err, "Failed to fetch registrations"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
  }, []);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    const delay = trimmed === "" ? 0 : 300;
    const id = window.setTimeout(() => setDebouncedSearch(trimmed), delay);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => {
    if (!successBanner) return undefined;
    const id = window.setTimeout(() => setSuccessBanner(null), 6000);
    return () => window.clearTimeout(id);
  }, [successBanner]);

  const openView = async (row: RegistrationRow) => {
    setError("");
    setViewLoadingId(row.id);
    try {
      const user = await userService.getUserById(String(row.id));
      setViewUser(user);
      setViewRow(row);
    } catch (err) {
      setError(parseApiError(err, "Failed to load student details"));
      setViewUser(null);
      setViewRow(null);
    } finally {
      setViewLoadingId(null);
    }
  };

  const closeView = () => {
    setViewUser(null);
    setViewRow(null);
  };

  const registrationRecap = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const row of rows) {
      const st = (row.approvalStatus || "pending").toLowerCase();
      if (st === "approved") approved += 1;
      else if (st === "rejected") rejected += 1;
      else pending += 1;
    }
    return { total: rows.length, pending, approved, rejected };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter((row) => {
      const st = (row.approvalStatus || "pending").toLowerCase();
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!q) return true;
      return (
        (row.name || "").toLowerCase().includes(q) ||
        (row.email || "").toLowerCase().includes(q) ||
        (row.enrollmentNumber || "").toLowerCase().includes(q)
      );
    });
  }, [rows, debouncedSearch, statusFilter]);

  const filterEmptyMessage = useMemo(() => {
    const q = debouncedSearch.trim();
    const statusLabel =
      STATUS_FILTER_OPTIONS.find(([v]) => v === statusFilter)?.[1] ?? statusFilter;
    if (!q && statusFilter === "all") {
      return "No registrations match your filters.";
    }
    const parts: string[] = [];
    if (q) parts.push(`search “${q}”`);
    if (statusFilter !== "all") parts.push(`status “${statusLabel}”`);
    return `No registrations match ${parts.join(" and ")}. Try adjusting ${parts.length > 1 ? "them" : "it"}.`;
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredRows, currentPage, pageSize],
  );

  const paginationItems: PageItem[] = useMemo(() => {
    const tp = totalPages;
    const cp = currentPage;
    if (tp <= 5) {
      return Array.from({ length: tp }, (_, i) => i + 1);
    }
    if (cp <= 3) {
      return [1, 2, 3, "ellipsis", tp];
    }
    if (cp >= tp - 2) {
      return [1, "ellipsis", tp - 2, tp - 1, tp];
    }
    return [1, "ellipsis", cp - 1, cp, cp + 1, "ellipsis", tp];
  }, [currentPage, totalPages]);

  const statusBadgeVariant = (raw: string): "pending" | "approved" | "rejected" | "neutral" => {
    const st = (raw || "pending").toLowerCase();
    if (st === "approved") return "approved";
    if (st === "rejected") return "rejected";
    if (st === "pending") return "pending";
    return "neutral";
  };

  const formatCreated = (iso: string) => formatDdMmYyTime(iso);

  const openReviewModal = (id: number, action: "approved" | "rejected") => {
    setError("");
    setSuccessBanner(null);
    setReviewReason("");
    setReviewExpiryDate("");
    setReviewModal({ id, action });
  };

  const closeReviewModal = () => {
    if (reviewSubmitting) return;
    setReviewModal(null);
    setReviewReason("");
    setReviewExpiryDate("");
    setActionKey((k) => k + 1);
  };

  const submitReview = async () => {
    if (!reviewModal) return;
    const reason = reviewReason.trim();
    if (reviewModal.action === "rejected" && !reason) {
      setError("Reason is required to reject a registration.");
      return;
    }
    if (reviewModal.action === "approved" && !reviewExpiryDate.trim()) {
      setError("Expiry date is required to approve a registration.");
      return;
    }
    setError("");
    setReviewSubmitting(true);
    try {
      const payload: {
        approvalStatus: string;
        approvalReason: string;
        expiryDate?: string;
      } = {
        approvalStatus: reviewModal.action,
        approvalReason: reviewModal.action === "rejected" ? reason : reason || "",
      };
      if (reviewModal.action === "approved") {
        payload.expiryDate = reviewExpiryDate.trim();
      }
      await httpClient.put(
        API_ENDPOINTS.REGISTRATIONS.STUDENT_REVIEW(reviewModal.id),
        payload,
      );
      await fetchRows();
      setSuccessBanner(
        reviewModal.action === "approved"
          ? "Registration approved successfully."
          : "Registration rejected.",
      );
      setReviewModal(null);
      setReviewReason("");
      setReviewExpiryDate("");
      setActionKey((k) => k + 1);
    } catch (err) {
      setError(parseApiError(err, "Failed to update review"));
    } finally {
      setReviewSubmitting(false);
    }
  };

  const onActionSelect = (rowId: number, value: string) => {
    if (value === "approve") openReviewModal(rowId, "approved");
    else if (value === "reject") openReviewModal(rowId, "rejected");
  };

  const listLoading = loading && rows.length === 0;
  const listFetchError = error && rows.length === 0 ? error : null;
  const listEmpty = !loading && rows.length === 0 && !error;
  const listIdle = !listLoading && !listFetchError && !listEmpty;

  const listState: "loading" | "error" | "empty" | "idle" = listLoading
    ? "loading"
    : listFetchError
      ? "error"
      : listEmpty
        ? "empty"
        : "idle";

  return (
    <div
      className="users-page registrations-page"
      data-registrations-list-state={listState}
      aria-busy={loading || undefined}
    >
      <EdgeStateView
        loading={listLoading}
        error={listFetchError}
        onRetry={() => void fetchRows()}
        retryLabel="Try again"
        loadingMessage="Loading registrations…"
        loadingVariant="page"
        empty={listEmpty}
        emptyMessage="No registrations yet. New student sign-ups will appear here."
        onEmptyAction={() => void fetchRows()}
        emptyActionLabel="Try again"
        isOnline={isOnline}
      >
        <>
          {successBanner && listIdle ? (
            <StateBanner
              variant="success"
              message={successBanner}
              onDismiss={() => setSuccessBanner(null)}
            />
          ) : null}
          {error && rows.length > 0 ? (
            <StateBanner
              variant="error"
              message={error}
              onRetry={() => void fetchRows()}
              retryLabel="Try again"
              onDismiss={() => setError("")}
            />
          ) : null}

          <div className="recap-section" aria-label="Registration summary">
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
                  <path d="M6 2h5l3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                  <path d="M9 2v4h4" />
                  <path d="M6 10h8" />
                  <path d="M6 13h5" />
                </svg>
              </div>
              <div className="recap-body">
                <div className="recap-label">Total</div>
                <div className="recap-value">
                  <AnimatedNumber value={registrationRecap.total} />
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
                  aria-hidden="true"
                >
                  <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
                  <path d="M6.5 10.2 9 12.7l4.5-4.5" />
                </svg>
              </div>
              <div className="recap-body">
                <div className="recap-label">Approved</div>
                <div className="recap-value">
                  <AnimatedNumber value={registrationRecap.approved} />
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
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6v4l3 2" />
                </svg>
              </div>
              <div className="recap-body">
                <div className="recap-label">Pending</div>
                <div className="recap-value">
                  <AnimatedNumber value={registrationRecap.pending} />
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
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="7" />
                  <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
                </svg>
              </div>
              <div className="recap-body">
                <div className="recap-label">Rejected</div>
                <div className="recap-value">
                  <AnimatedNumber value={registrationRecap.rejected} />
                </div>
              </div>
            </div>
          </div>

          <div className="page-header registrations-page__header">
            <div className="ride-bill-toolbar registrations-toolbar" role="search">
              <div className="ride-bill-segments ride-bill-toolbar__search-wrap">
                <input
                  type="search"
                  className="ride-bill-toolbar__search"
                  placeholder="Search name, email, or entry number"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search registrations"
                  autoComplete="off"
                />
              </div>
              <div className="ride-bill-toolbar__time-range registrations-toolbar__status">
                <div className="ride-bill-segments" role="group" aria-label="Filter by approval status">
                  {STATUS_FILTER_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`ride-bill-segments__btn ${statusFilter === value ? "ride-bill-segments__btn--active" : ""}`}
                      onClick={() => setStatusFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="registrations-wrap">
            {filteredRows.length === 0 ? (
              <EmptyState
                message={filterEmptyMessage}
                iconName="search"
                isOnline={isOnline}
                onAction={() => {
                  setSearchTerm("");
                  setDebouncedSearch("");
                  setStatusFilter("all");
                }}
                actionLabel="Clear search & filters"
              />
            ) : (
              <table className="registrations-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Entry</th>
                    <th scope="col">Status</th>
                    <th scope="col">Created</th>
                    <th scope="col" className="cell-actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="cell-name">{row.name || "—"}</td>
                      <td className="cell-email">{row.email || "—"}</td>
                      <td>{row.enrollmentNumber || "—"}</td>
                      <td className="cell-status">
                        <span
                          className={`registrations-status-badge registrations-status-badge--${statusBadgeVariant(row.approvalStatus)}`}
                        >
                          {row.approvalStatus || "pending"}
                        </span>
                      </td>
                      <td className="cell-created">{formatCreated(row.createdAt)}</td>
                      <td className="cell-actions">
                        <div className="cell-actions-inner">
                          <button
                            type="button"
                            className="action-btn view btn-view"
                            onClick={() => void openView(row)}
                            disabled={viewLoadingId === row.id}
                          >
                            {viewLoadingId === row.id ? "…" : "View"}
                          </button>
                          <select
                            key={`action-${row.id}-${actionKey}`}
                            className="filter-select select-review"
                            aria-label={`Review action for ${row.name || row.email}`}
                            defaultValue=""
                            onChange={(e) => {
                              const v = e.target.value;
                              e.target.value = "";
                              if (v === "approve" || v === "reject") {
                                onActionSelect(row.id, v);
                              }
                            }}
                            title="Review"
                          >
                            <option value="">Review</option>
                            <option value="approve">Approve</option>
                            <option value="reject">Reject</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && filteredRows.length > 0 ? (
            <div className="registrations-pagination" role="navigation" aria-label="Registration list pagination">
              <div className="registrations-pagination__size">
                <label htmlFor="registrations-page-size">Rows per page</label>
                <select
                  id="registrations-page-size"
                  className="filter-select registrations-pagination__size-select"
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
              <div className="registrations-pagination__nav">
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
                      <span key={`ellipsis-${idx}`} className="pagination-ellipsis" aria-hidden="true">
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
      </EdgeStateView>

      {reviewModal ? (
        <div
          className="view-modal-overlay registrations-review-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
          onClick={closeReviewModal}
        >
          <div className="view-modal-content registrations-review-modal__content" onClick={(e) => e.stopPropagation()}>
            <div className="view-modal-header">
              <h2 id="review-modal-title" className="registrations-review-modal__title">
                {reviewModal.action === "approved" ? "Approve registration" : "Reject registration"}
              </h2>
              <button type="button" className="view-modal-close-btn" onClick={closeReviewModal} title="Close" disabled={reviewSubmitting}>
                ×
              </button>
            </div>
            <div className="view-modal-body">
              {reviewModal.action === "approved" ? (
                <>
                  <label className="registrations-review-modal__label" htmlFor="review-expiry-date">
                    Expiry date <span aria-hidden="true">*</span>
                  </label>
                  <DatePicker
                    id="review-expiry-date"
                    selected={reviewExpiryDate ? dateFromYmd(reviewExpiryDate) : null}
                    onChange={(date: Date | null) => setReviewExpiryDate(date ? localYmd(date) : "")}
                    minDate={expiryMinDate}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="dd/mm/yyyy"
                    className="ride-bill-date-picker-input"
                    wrapperClassName="registrations-review-modal__datepicker-wrap"
                    showYearDropdown
                    showMonthDropdown
                    dropdownMode="select"
                    aria-required="true"
                  />
                  <p className="registrations-review-modal__hint">Account access is valid through this date.</p>
                  <label className="registrations-review-modal__label registrations-review-modal__label--spaced" htmlFor="review-reason-approve">
                    Reason <span className="registrations-review-modal__optional">(optional)</span>
                  </label>
                  <textarea
                    id="review-reason-approve"
                    className="registrations-review-modal__textarea"
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    rows={4}
                    placeholder="Optional note for the student or internal record…"
                  />
                </>
              ) : (
                <>
                  <label className="registrations-review-modal__label" htmlFor="review-reason-reject">
                    Reason <span aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="review-reason-reject"
                    className="registrations-review-modal__textarea"
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    rows={4}
                    placeholder="Explain why this registration is rejected…"
                    required
                    aria-required="true"
                  />
                </>
              )}
            </div>
            <div className="view-modal-footer registrations-review-modal__footer">
              <button type="button" className="view-modal-close-button" onClick={closeReviewModal} disabled={reviewSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                className={`registrations-review-modal__submit ${reviewModal.action === "rejected" ? "registrations-review-modal__submit--reject" : ""}`}
                onClick={() => void submitReview()}
                disabled={reviewSubmitting}
              >
                {reviewSubmitting ? "Saving…" : reviewModal.action === "approved" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewUser && viewRow ? (
        <ViewUserModal
          key={viewUser._id}
          user={viewUser}
          onClose={closeView}
          registrationReview={{
            approvalStatus: viewRow.approvalStatus,
            approvalReason: viewRow.approvalReason,
            createdAt: viewRow.createdAt,
          }}
        />
      ) : null}
    </div>
  );
};

export default Registrations;
