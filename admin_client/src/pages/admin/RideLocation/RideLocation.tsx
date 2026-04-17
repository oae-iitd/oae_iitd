import React, { useState, useEffect, useMemo, useCallback } from "react";
import "../Users/Users.css";
import "../RideBill/RideBill.css";
import "./RideLocation.css";
import { ridesService } from "../../../services/rides/rides.service";
import type { RideLocation as RideLocationType } from "../../../services/rides/rides.service";
import {
  AnimatedNumber,
  EdgeStateView,
  EmptyState,
  StateBanner,
  useToast,
} from "../../../components/common";
import { formatDdMmYyTime, formatINR } from "../RideBill/exportRideBills";

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

const BidirectionalIcon: React.FC<{
  size?: number;
  className?: string;
  title?: string;
}> = ({
  size = 20,
  className = "",
  title = "Same fare both directions",
}) => (
  <span
    className={["ride-location-bidirectional-icon", className].filter(Boolean).join(" ")}
    title={title}
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18" />
    </svg>
  </span>
);

const PREDEFINED_LOCATIONS = [
  "Adchini Gate",
  "Aravali",
  "Avanti",
  "Himadri",
  "IIT Market",
  "IRD",
  "Jia Sarai Gate",
  "JNU Gate",
  "Jwalamukhi",
  "Kailash",
  "Karakoram",
  "Katwaria Sarai Gate",
  "Kumaon",
  "Main Gate",
  "LHC",
  "Mehrauli Gate",
  "Nilgiri",
  "R&I Park",
  "Satpura",
  "Shani Mandir Gate",
  "Shivalik",
  "Taxila",
  "Udaigiri",
  "Vaishali",
  "Vikramshila",
  "Vindhyachal",
  "Vishwakarma Bhawan",
  "Zanskar",
] as const;

const PAGE_SIZE_OPTIONS: number[] = [
  ...Array.from({ length: 10 }, (_, i) => i + 1),
  20, 30, 40, 50, 60, 70, 80, 90, 100,
];

type PageItem = number | "ellipsis";

type RideLocationListState = "loading" | "error" | "empty" | "idle";

function getPaginationItems(currentPage: number, totalPages: number): PageItem[] {
  const tp = totalPages;
  const cp = currentPage;
  if (tp <= 5) return Array.from({ length: tp }, (_, i) => i + 1);
  if (cp <= 3) return [1, 2, 3, "ellipsis", tp];
  if (cp >= tp - 2) return [1, "ellipsis", tp - 2, tp - 1, tp];
  return [1, "ellipsis", cp - 1, cp, cp + 1, "ellipsis", tp];
}

const RideLocation: React.FC = () => {
  const { showSuccess, showError } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [locations, setLocations] = useState<RideLocationType[]>([]);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<RideLocationType | null>(
    null,
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [routePendingDelete, setRoutePendingDelete] =
    useState<RideLocationType | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const fetchLocations = useCallback(async () => {
    setError(null);
    try {
      const data = await ridesService.getRides({
        search: debouncedSearch || undefined,
      });
      setLocations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch ride routes:", err);
      setError(parseApiError(err, "Failed to load ride routes. Please try again."));
    } finally {
      setInitialFetchDone(true);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    const delay = trimmed === "" ? 0 : 300;
    const id = setTimeout(() => setDebouncedSearch(trimmed), delay);
    return () => clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => {
    void fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, pageSize]);

  const totalPages = Math.max(1, Math.ceil(locations.length / pageSize));

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginatedLocations = useMemo(
    () =>
      locations.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
      ),
    [locations, currentPage, pageSize],
  );

  const paginationItems = useMemo(
    () => getPaginationItems(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const closeDeleteConfirm = useCallback(() => {
    if (deleteSubmitting) return;
    setRoutePendingDelete(null);
  }, [deleteSubmitting]);

  useEffect(() => {
    if (!routePendingDelete) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDeleteConfirm();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [routePendingDelete, closeDeleteConfirm]);

  const confirmDeleteRoute = async () => {
    if (!routePendingDelete) return;
    const id = routePendingDelete._id;
    setDeleteSubmitting(true);
    try {
      await ridesService.deleteRide(id);
      setLocations((prev) => prev.filter((loc) => loc._id !== id));
      setRoutePendingDelete(null);
      showSuccess(
        "Route removed - that fare no longer applies in either direction.",
        5200,
      );
    } catch (err) {
      console.error("Failed to delete ride route:", err);
      showError(parseApiError(err, "Couldn't remove that route."));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleEdit = (location: RideLocationType) => {
    setRoutePendingDelete(null);
    setEditingLocation(location);
    setShowAddModal(true);
  };

  const handleAdd = () => {
    setRoutePendingDelete(null);
    setEditingLocation(null);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingLocation(null);
  };

  const handleSave = async (locationData: Record<string, unknown>) => {
    const wasEdit = Boolean(editingLocation);
    try {
      if (editingLocation) {
        await ridesService.updateRide(editingLocation._id, locationData);
      } else {
        await ridesService.createRide(
          locationData as { fromLocation: string; toLocation: string },
        );
      }
      handleCloseModal();
      await fetchLocations();
      showSuccess(
        wasEdit ? "Ride route updated." : "Ride route created.",
        4800,
      );
    } catch (err) {
      console.error("Failed to save ride route:", err);
      showError(parseApiError(err, "Couldn't save this route."));
    }
  };

  const listLoading = !initialFetchDone;
  const listFetchError = error && locations.length === 0 ? error : null;
  const listEmpty =
    initialFetchDone && !error && locations.length === 0;

  const listState: RideLocationListState = listLoading
    ? "loading"
    : listFetchError
      ? "error"
      : listEmpty
        ? "empty"
        : "idle";

  const showMainShell = !listLoading && !listFetchError;

  return (
    <div
      className="users-page ride-location-page"
      data-ride-location-list-state={listState}
      aria-busy={!initialFetchDone ? true : undefined}
    >
      <EdgeStateView
        loading={listLoading}
        error={listFetchError}
        onRetry={() => void fetchLocations()}
        retryLabel="Try again"
        loadingMessage="Loading ride routes…"
        loadingVariant="page"
        empty={false}
      >
        <>
          {error && locations.length > 0 ? (
            <StateBanner
              variant="error"
              message={error}
              onRetry={() => void fetchLocations()}
              retryLabel="Try again"
              onDismiss={() => setError(null)}
            />
          ) : null}

          {showMainShell ? (
            <>
              <div className="recap-section" aria-label="Ride routes summary">
                <div className="recap-card">
                  <div className="recap-icon recap-icon--teal">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                      <path d="M8 12h.01M12 12h.01M16 12h.01" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Routes</div>
                    <div className="recap-value">
                      <AnimatedNumber value={locations.length} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="page-header ride-location-page__header">
                <div className="ride-bill-toolbar ride-location-toolbar" role="search">
                  <div className="ride-bill-segments ride-bill-toolbar__search-wrap">
                    <input
                      type="search"
                      className="ride-bill-toolbar__search"
                      placeholder="Search by stop name (from or to)…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      aria-label="Search ride routes by stop name"
                      autoComplete="off"
                    />
                  </div>
                  <div className="ride-bill-segments ride-bill-toolbar__export-wrap">
                    <button
                      type="button"
                      className="ride-bill-segments__btn ride-bill-segments__btn--active"
                      onClick={handleAdd}
                      aria-label="Add ride route"
                    >
                      Add route
                    </button>
                  </div>
                </div>
              </div>

              <div className="ride-location-wrap">
                {locations.length === 0 ? (
                  debouncedSearch ? (
                    <EmptyState
                      message={`No routes match “${debouncedSearch}”. Try another stop name.`}
                      iconName="search"
                      onAction={() => {
                        setSearchTerm("");
                        setDebouncedSearch("");
                      }}
                      actionLabel="Clear search"
                    />
                  ) : (
                    <EmptyState
                      message="No ride routes yet. Use Add route in the toolbar, or try again to load from the server."
                      iconName="tray"
                      onAction={() => void fetchLocations()}
                      actionLabel="Try again"
                    />
                  )
                ) : (
                  <table className="ride-routes-table">
                    <thead>
                      <tr>
                        <th>Route (bidirectional)</th>
                        <th>Fare</th>
                        <th>Created</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedLocations.map((location) => (
                        <tr key={location._id}>
                          <td>
                            <span className="route-cell">
                              <span className="route-cell__location">
                                {location.fromLocation}
                              </span>
                              <span className="route-cell__arrow">
                                <BidirectionalIcon
                                  size={18}
                                  title="Same fare both directions"
                                />
                              </span>
                              <span className="route-cell__location">
                                {location.toLocation}
                              </span>
                            </span>
                          </td>
                          <td className="ride-routes-table__fare">
                            {formatINR(location.fare ?? 0)}
                          </td>
                          <td className="ride-routes-table__muted">
                            {formatDdMmYyTime(location.createdAt)}
                          </td>
                          <td className="ride-routes-table__muted">
                            {formatDdMmYyTime(location.updatedAt)}
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="action-btn edit"
                                onClick={() => handleEdit(location)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="action-btn delete"
                                onClick={() => setRoutePendingDelete(location)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {locations.length > 0 ? (
                <div
                  className="users-pagination"
                  role="navigation"
                  aria-label="Ride routes pagination"
                >
                  <div className="users-pagination__size">
                    <label htmlFor="ride-routes-page-size">Rows per page</label>
                    <select
                      id="ride-routes-page-size"
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
                          <span
                            key={`ellipsis-${idx}`}
                            className="pagination-ellipsis"
                            aria-hidden="true"
                          >
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
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
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

      {routePendingDelete ? (
        <div
          className="ride-location-confirm-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteConfirm();
          }}
        >
          <div
            className="ride-location-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ride-delete-title"
            aria-describedby="ride-delete-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ride-delete-title" className="ride-location-confirm__title">
              Remove this route?
            </h2>
            <p id="ride-delete-desc" className="ride-location-confirm__desc">
              Riders will no longer get this fare between these stops in either
              direction. You can add the pair again later if needed.
            </p>
            <div className="ride-location-confirm__preview" aria-live="polite">
              <span className="ride-location-confirm__stop">
                {routePendingDelete.fromLocation}
              </span>
              <span className="ride-location-confirm__icon">
                <BidirectionalIcon size={16} title="" />
              </span>
              <span className="ride-location-confirm__stop">
                {routePendingDelete.toLocation}
              </span>
              <span className="ride-location-confirm__fare">
                {formatINR(routePendingDelete.fare ?? 0)}
              </span>
            </div>
            <div className="ride-location-confirm__actions">
              <button
                type="button"
                className="ride-location-confirm__btn-secondary"
                onClick={closeDeleteConfirm}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ride-location-confirm__btn-danger"
                onClick={() => void confirmDeleteRoute()}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Removing…" : "Remove route"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddModal ? (
        <LocationModal
          key={editingLocation?._id ?? "new"}
          location={editingLocation}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      ) : null}
    </div>
  );
};

interface LocationModalProps {
  location: RideLocationType | null;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}

const SwapStopsIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
  </svg>
);

function formStateFromLocation(loc: RideLocationType | null) {
  return {
    fromLocation: loc?.fromLocation ?? "",
    toLocation: loc?.toLocation ?? "",
    fare: loc?.fare != null ? String(loc.fare) : "",
  };
}

const LocationModal: React.FC<LocationModalProps> = ({
  location,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState(() => formStateFromLocation(location));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const swapStops = () => {
    setFormData((prev) => ({
      ...prev,
      fromLocation: prev.toLocation,
      toLocation: prev.fromLocation,
    }));
  };

  const sameStop =
    Boolean(formData.fromLocation) &&
    Boolean(formData.toLocation) &&
    formData.fromLocation === formData.toLocation;

  const bothStopsChosen =
    Boolean(formData.fromLocation) && Boolean(formData.toLocation);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sameStop) return;
    const fareNum = formData.fare.trim() === "" ? 0 : parseFloat(formData.fare);
    onSave({
      ...formData,
      fare: Number.isFinite(fareNum) ? fareNum : 0,
    });
  };

  return (
    <div
      className="ride-location-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ride-location-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ride-location-modal-title"
        aria-describedby="ride-location-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ride-location-modal__header">
          <div className="ride-location-modal__header-text">
            <h2 id="ride-location-modal-title" className="ride-location-modal__title">
              {location ? "Edit ride route" : "Add ride route"}
            </h2>
            <p id="ride-location-modal-desc" className="ride-location-modal__subtitle">
              {location
                ? "Update stops or fare. One price applies for travel in either direction."
                : "Choose two stops and set one fare — it applies both ways."}
            </p>
          </div>
          <button
            type="button"
            className="ride-location-modal__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <span aria-hidden>×</span>
          </button>
        </div>

        <div className="ride-location-modal__callout" role="note">
          <BidirectionalIcon
            size={18}
            title=""
            className="ride-location-modal__callout-icon"
          />
          <span>Bidirectional route — same fare from A→B and B→A.</span>
        </div>

        <form onSubmit={handleSubmit} className="ride-location-modal__form">
          <section className="ride-location-modal__stops" aria-labelledby="ride-stops-heading">
            <div className="ride-location-modal__stops-heading">
              <h3 id="ride-stops-heading" className="ride-location-modal__section-title">
                Stops
              </h3>
              <p className="ride-location-modal__legend-hint">
                Order does not matter; use swap if you want the names reversed in the list.
              </p>
            </div>

            <div className="ride-location-modal__field">
              <label htmlFor="ride-from">First stop</label>
              <select
                id="ride-from"
                required
                value={formData.fromLocation}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, fromLocation: e.target.value }))
                }
              >
                <option value="">Select…</option>
                {PREDEFINED_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            <div className="ride-location-modal__swap-wrap">
              <button
                type="button"
                className="ride-location-modal__swap"
                onClick={swapStops}
                disabled={!formData.fromLocation && !formData.toLocation}
                title="Exchange first and second stop"
              >
                <SwapStopsIcon />
                <span>Swap stops</span>
              </button>
            </div>

            <div className="ride-location-modal__field">
              <label htmlFor="ride-to">Second stop</label>
              <select
                id="ride-to"
                required
                value={formData.toLocation}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, toLocation: e.target.value }))
                }
              >
                <option value="">Select…</option>
                {PREDEFINED_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            {bothStopsChosen ? (
              <div className="ride-location-modal__preview" aria-live="polite">
                <span className="ride-location-modal__preview-label">Preview</span>
                <div className="ride-location-modal__preview-pair">
                  <span className="ride-location-modal__preview-stop">
                    {formData.fromLocation}
                  </span>
                  <span className="ride-location-modal__preview-icon" title="Both directions">
                    <BidirectionalIcon size={16} />
                  </span>
                  <span className="ride-location-modal__preview-stop">
                    {formData.toLocation}
                  </span>
                </div>
              </div>
            ) : null}

            {sameStop ? (
              <p className="ride-location-modal__error" role="alert">
                Pick two different stops.
              </p>
            ) : null}
          </section>

          <div className="ride-location-modal__field ride-location-modal__field--fare">
            <label htmlFor="ride-fare">Fare (per trip)</label>
            <div className="ride-location-modal__fare-input">
              <span className="ride-location-modal__fare-prefix" aria-hidden="true">
                ₹
              </span>
              <input
                id="ride-fare"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.fare}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, fare: e.target.value }))
                }
              />
            </div>
            <p className="ride-location-modal__field-hint">Either direction</p>
          </div>

          <div className="ride-location-modal__actions">
            <button
              type="button"
              className="ride-location-modal__btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ride-location-modal__btn-primary"
              disabled={sameStop}
            >
              {location ? "Save changes" : "Create route"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RideLocation;
