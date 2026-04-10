import React, { useState, useEffect, useMemo } from "react";
import "./Users.css";
import "../RideBill/RideBill.css";
import { UserModal } from "./UserModal";
import ViewUserModal from "../../../components/admin/ViewUserModal";
import AuthenticatedProfileImage from "../../../components/admin/AuthenticatedProfileImage";
import { userService } from "../../../services/user/user.service";
import {
  useToast,
  EdgeStateView,
  EmptyState,
  StateBanner,
  AnimatedNumber,
} from "../../../components/common";
import { useAuth } from "../../../hooks/auth/useAuth";
import type {
  User,
  CreateUserDto,
  UpdateUserDto,
} from "../../../services/user/user.service";

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

const PAGE_SIZE_OPTIONS: number[] = [
  ...Array.from({ length: 10 }, (_, i) => i + 1),
  20,
  30,
  40,
  50,
  60,
  70,
  80,
  90,
  100,
];

type PageItem = number | "ellipsis";

const ROLE_FILTER_OPTIONS = [
  ["all", "All"],
  ["admin", "Admin"],
  ["superadmin", "Super Admin"],
  ["student", "Student"],
  ["driver", "Driver"],
] as const satisfies ReadonlyArray<readonly [string, string]>;

const STATUS_FILTER_OPTIONS = [
  ["all", "All"],
  ["active", "Active"],
  ["inactive", "Inactive"],
  ["expired", "Expired"],
  ["closed", "Closed"],
] as const satisfies ReadonlyArray<readonly [string, string]>;

function roleHasViewAction(role: string | undefined): boolean {
  const r = role?.toLowerCase() ?? "";
  return (
    r === "student" || r === "driver" || r === "admin" || r === "superadmin"
  );
}

function formatRoleLabel(role: string | undefined): string {
  if (!role) return "—";
  return role.toLowerCase() === "superadmin" ? "Super Admin" : role;
}

const SUCCESS_TOAST_MS = 4800;

type UsersListState = "loading" | "error" | "empty" | "idle";

const Users: React.FC = () => {
  const { showSuccess, showError } = useToast();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusChangeUser, setStatusChangeUser] = useState<User | null>(null);
  const [statusChangePosition, setStatusChangePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const canModifyTargetUser = (targetUser: User): boolean =>
    !!currentUser && targetUser.role?.toLowerCase() !== "superadmin";

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    const delay = trimmed === "" ? 0 : 300;
    const id = window.setTimeout(() => setDebouncedSearch(trimmed), delay);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  const fetchUsers = async () => {
    setError(null);
    try {
      const data = await userService.getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setError(parseApiError(err, "Failed to fetch users. Please try again."));
    } finally {
      setInitialFetchDone(true);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    const targetUser = users.find((u) => u._id === id);
    if (!targetUser) {
      showError("User not found.");
      return;
    }

    if (!canModifyTargetUser(targetUser)) {
      showError("Cannot delete Super Admin users.");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this user?")) {
      return;
    }

    try {
      await userService.deleteUser(id);
      showSuccess("User deleted successfully.", SUCCESS_TOAST_MS);
      await fetchUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
      showError(parseApiError(err, "Failed to delete user. Please try again."));
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    const targetUser = users.find((u) => u._id === userId);
    if (!targetUser) {
      showError("User not found.");
      return;
    }

    if (!canModifyTargetUser(targetUser)) {
      showError("Cannot change the status of Super Admin users.");
      setStatusChangeUser(null);
      setStatusChangePosition(null);
      return;
    }

    try {
      await userService.updateUser(userId, { status: newStatus });
      showSuccess(
        `User status updated to ${newStatus} successfully!`,
        SUCCESS_TOAST_MS,
      );
      setStatusChangeUser(null);
      setStatusChangePosition(null);
      await fetchUsers();
    } catch (err) {
      console.error("Failed to update status:", err);
      showError(
        parseApiError(err, "Failed to update status. Please try again."),
      );
    }
  };

  const handleStatusClick = (e: React.MouseEvent, user: User) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setStatusChangeUser(user);
    setStatusChangePosition({ x: rect.left, y: rect.bottom + 5 });
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingUser(null);
  };

  const handleSave = async (userData: CreateUserDto | UpdateUserDto) => {
    try {
      if (editingUser) {
        await userService.updateUser(
          editingUser._id,
          userData as UpdateUserDto,
        );
        showSuccess("User updated successfully.", SUCCESS_TOAST_MS);
      } else {
        await userService.createUser(userData as CreateUserDto);
        showSuccess(
          userData.role === "Driver"
            ? "Driver created successfully. They can sign in with phone and OTP on the mobile app."
            : `User created successfully! Login credentials have been sent to ${(userData as CreateUserDto).email ?? ""}`,
          SUCCESS_TOAST_MS,
        );
      }
      handleCloseModal();
      await fetchUsers();
    } catch (err) {
      console.error("Failed to save user:", err);
      const error = err as {
        response?: {
          data?: {
            details?: Record<string, string | string[]>;
            error?: string;
            message?: string;
          };
        };
      };

      if (error.response?.data?.details) {
        const details = error.response.data.details;
        const errorMessages: string[] = [];
        Object.entries(details).forEach(([field, messages]) => {
          const fieldLabel =
            field.charAt(0).toUpperCase() +
            field
              .slice(1)
              .replace(/([A-Z])/g, " $1")
              .trim();
          const fieldMessages = Array.isArray(messages) ? messages : [messages];
          fieldMessages.forEach((msg: string) => {
            errorMessages.push(`${fieldLabel}: ${msg}`);
          });
        });
        showError(
          `Validation Failed! Please fix the following errors:\n\n${errorMessages.join("\n")}`,
        );
      } else {
        const errorMessage =
          error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to save user. Please try again.";
        showError(errorMessage);
      }
    }
  };

  const filteredUsers = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !q ||
        user.username?.toLowerCase().includes(q) ||
        user.email?.toLowerCase().includes(q) ||
        user.phone?.toLowerCase().includes(q) ||
        user.name?.toLowerCase().includes(q);
      const matchesRole =
        filterRole === "all" ||
        user.role?.toLowerCase() === filterRole.toLowerCase();
      const matchesStatus =
        filterStatus === "all" ||
        user.status?.toLowerCase() === filterStatus.toLowerCase();
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, debouncedSearch, filterRole, filterStatus]);

  const filterEmptyMessage = useMemo(() => {
    const q = debouncedSearch.trim();
    const roleLabel =
      ROLE_FILTER_OPTIONS.find(([v]) => v === filterRole)?.[1] ?? filterRole;
    const statusLabel =
      STATUS_FILTER_OPTIONS.find(([v]) => v === filterStatus)?.[1] ??
      filterStatus;
    if (!q && filterRole === "all" && filterStatus === "all") {
      return "No users match your filters.";
    }
    const parts: string[] = [];
    if (q) parts.push(`search “${q}”`);
    if (filterRole !== "all") parts.push(`role “${roleLabel}”`);
    if (filterStatus !== "all") parts.push(`status “${statusLabel}”`);
    return `No users match ${parts.join(" and ")}. Try adjusting ${parts.length > 1 ? "them" : "it"}.`;
  }, [debouncedSearch, filterRole, filterStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterRole, filterStatus, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginatedUsers = useMemo(
    () =>
      filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredUsers, currentPage, pageSize],
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

  const userRecap = useMemo(() => {
    const list = users;
    const statusOf = (u: User) => (u.status || "active").toLowerCase();
    const roleOf = (u: User) => u.role?.toLowerCase() ?? "";
    return {
      total: list.length,
      active: list.filter((u) => statusOf(u) === "active").length,
      notActive: list.filter((u) => statusOf(u) !== "active").length,
      students: list.filter((u) => roleOf(u) === "student").length,
      admins: list.filter((u) => roleOf(u) === "admin").length,
      superAdmins: list.filter((u) => roleOf(u) === "superadmin").length,
      drivers: list.filter((u) => roleOf(u) === "driver").length,
    };
  }, [users]);

  const listLoading = !initialFetchDone;
  const listFetchError = error && users.length === 0 ? error : null;
  const listEmpty = initialFetchDone && !error && users.length === 0;
  const listIdle = initialFetchDone && !listFetchError && !listEmpty;

  const listState: UsersListState = listLoading
    ? "loading"
    : listFetchError
      ? "error"
      : listEmpty
        ? "empty"
        : "idle";

  const canChangePendingStatus =
    statusChangeUser !== null && canModifyTargetUser(statusChangeUser);

  return (
    <div
      className="users-page"
      data-users-list-state={listState}
      aria-busy={listLoading ? true : undefined}
    >
      <EdgeStateView
        loading={listLoading}
        error={listFetchError}
        onRetry={() => void fetchUsers()}
        retryLabel="Try again"
        loadingMessage="Loading users…"
        loadingVariant="page"
        empty={listEmpty}
        emptyMessage="No users yet. Add a user to get started."
        emptyActionLabel="Add user"
        onEmptyAction={() => setShowAddModal(true)}
      >
        <>
          {error && users.length > 0 ? (
            <StateBanner
              variant="error"
              message={error}
              onRetry={() => void fetchUsers()}
              retryLabel="Refresh"
              onDismiss={() => setError(null)}
            />
          ) : null}

          {listIdle ? (
            <>
              <div className="recap-section" aria-label="User summary">
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
                      <AnimatedNumber value={userRecap.total} />
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
                    <div className="recap-label">Active</div>
                    <div className="recap-value">
                      <AnimatedNumber value={userRecap.active} />
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
                    <div className="recap-label">Inactive</div>
                    <div className="recap-value">
                      <AnimatedNumber value={userRecap.notActive} />
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
                      <circle cx="10" cy="6.5" r="2.5" />
                      <path d="M4 17c0-2.8 2.7-5 6-5s6 2.2 6 5" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Students</div>
                    <div className="recap-value">
                      <AnimatedNumber value={userRecap.students} />
                    </div>
                  </div>
                </div>

                <div className="recap-card">
                  <div className="recap-icon recap-icon--teal">
                    <svg
                      className="recap-icon-svg recap-icon-svg--fill"
                      viewBox="0 0 50 50"
                      aria-hidden="true"
                    >
                      <path
                        fill="currentColor"
                        d="M16.984375 6.9863281 A 1.0001 1.0001 0 0 0 16.841797 7L9 7C4.0414839 7 0 11.041484 0 16L0 18.832031 A 1.0001 1.0001 0 0 0 0 19.158203L0 23L0 24L0 33C0 35.209 1.791 37 4 37L4.0410156 37C4.0272801 37.166874 4 37.332921 4 37.5C4 38.847222 4.4436807 40.207881 5.3769531 41.257812C6.3102255 42.307744 7.7500005 43 9.5 43C11.249999 43 12.689774 42.307744 13.623047 41.257812C14.556319 40.207881 15 38.847222 15 37.5C15 37.332921 14.97272 37.166874 14.958984 37L32.085938 37L44.925781 27.013672L44.943359 26.998047C44.881359 25.661047 44.758797 24.385922 44.591797 23.169922C44.584797 23.114922 44.580266 23.055 44.572266 23L44.564453 23C43.597218 16.173862 41.207756 11.336942 39.828125 9L43 9 A 1.0001 1.0001 0 1 0 43 7L17.167969 7 A 1.0001 1.0001 0 0 0 16.984375 6.9863281 z M 9 9L16 9L16 18L2 18L2 16C2 12.122516 5.1225161 9 9 9 z M 18 9L30 9L30 25.5C30 28.533 27.532 31 24.5 31L22 31L22 28C22 25.585637 20.279096 23.566404 18 23.101562L18 19.167969 A 1.0001 1.0001 0 0 0 18 18.841797L18 9 z M 35 9L37.462891 9C38.128719 9.9710703 41.050765 14.526735 42.373047 22L35 22L35 9 z M 2 20L16 20L16 23L2 23L2 20 z M 45.919922 28.773438L36.628906 36L38.234375 36C38.096218 36.47937 38 36.976318 38 37.5C38 40.533 40.468 43 43.5 43C46.532 43 49 40.533 49 37.5C49 36.979775 48.922717 36.477329 48.787109 36L49 36C49.3 36 49.583438 35.866766 49.773438 35.634766C49.962438 35.403766 50.039469 35.098687 49.980469 34.804688C49.297469 31.384687 47.356922 29.629437 45.919922 28.773438 z M 40.351562 36L46.648438 36C46.866983 36.456487 47 36.961001 47 37.5C47 39.43 45.43 41 43.5 41C41.57 41 40 39.43 40 37.5C40 36.961001 40.133017 36.456487 40.351562 36 z M 6.0429688 37L12.957031 37C12.978067 37.165983 13 37.331532 13 37.5C13 38.402778 12.69368 39.292119 12.126953 39.929688C11.560226 40.567256 10.749999 41 9.5 41C8.2500008 41 7.4397738 40.567256 6.8730469 39.929688C6.3063199 39.292119 6 38.402778 6 37.5C6 37.331532 6.0219328 37.165983 6.0429688 37 z"
                      />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Drivers</div>
                    <div className="recap-value">
                      <AnimatedNumber value={userRecap.drivers} />
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
                      <path d="M10 3l7 3v5c0 5-3.5 9-7 7-3.5 2-7-2-7-7V6l7-3z" />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Admin</div>
                    <div className="recap-value">
                      <AnimatedNumber value={userRecap.admins} />
                    </div>
                  </div>
                </div>

                <div className="recap-card">
                  <div className="recap-icon recap-icon--amber">
                    <svg
                      className="recap-icon-svg recap-icon-svg--fill"
                      viewBox="0 0 1920 1920"
                      aria-hidden="true"
                    >
                      <path
                        fill="currentColor"
                        fillRule="evenodd"
                        d="M983.727 5.421 1723.04 353.62c19.765 9.374 32.414 29.252 32.414 51.162v601.525c0 489.6-424.207 719.774-733.779 887.943l-34.899 18.975c-8.47 4.517-17.731 6.889-27.105 6.889-9.262 0-18.523-2.372-26.993-6.89l-34.9-18.974C588.095 1726.08 164 1495.906 164 1006.306V404.78c0-21.91 12.65-41.788 32.414-51.162L935.727 5.42c15.134-7.228 32.866-7.228 48 0ZM757.088 383.322c-176.075 0-319.285 143.323-319.285 319.398 0 176.075 143.21 319.285 319.285 1.92 0 3.84 0 5.76-.113l58.504 58.503h83.689v116.781h116.781v83.803l91.595 91.482h313.412V1059.05l-350.57-350.682c.114-1.807.114-3.727.114-5.647 0-176.075-143.21-319.398-319.285-319.398Zm0 112.942c113.732 0 206.344 92.724 205.327 216.62l-3.953 37.271 355.426 355.652v153.713h-153.713l-25.412-25.299v-149.986h-116.78v-116.78H868.108l-63.812-63.7-47.209 5.309c-113.732 0-206.344-92.5-206.344-206.344 0-113.732 92.612-206.456 206.344-206.456Zm4.98 124.98c-46.757 0-84.705 37.948-84.705 84.706s37.948 84.706 84.706 84.706c46.757 0 84.706-37.948 84.706-84.706s-37.949-84.706-84.706-84.706Z"
                      />
                    </svg>
                  </div>
                  <div className="recap-body">
                    <div className="recap-label">Super Admin</div>
                    <div className="recap-value">
                      <AnimatedNumber value={userRecap.superAdmins} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="page-header users-page__header">
                <div className="ride-bill-toolbar users-toolbar" role="search">
                  <div className="ride-bill-segments ride-bill-toolbar__search-wrap">
                    <input
                      type="search"
                      className="ride-bill-toolbar__search"
                      placeholder="Search name, username, email, or phone"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      aria-label="Search users"
                      autoComplete="off"
                    />
                  </div>
                  <div className="users-toolbar__right">
                    <div className="ride-bill-toolbar__time-range users-toolbar__segment-block">
                      <div
                        className="ride-bill-segments"
                        role="group"
                        aria-label="Filter by role"
                      >
                        {ROLE_FILTER_OPTIONS.map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className={`ride-bill-segments__btn ${filterRole === value ? "ride-bill-segments__btn--active" : ""}`}
                            onClick={() => setFilterRole(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="ride-bill-toolbar__time-range users-toolbar__segment-block">
                      <div
                        className="ride-bill-segments"
                        role="group"
                        aria-label="Filter by account status"
                      >
                        {STATUS_FILTER_OPTIONS.map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className={`ride-bill-segments__btn ${filterStatus === value ? "ride-bill-segments__btn--active" : ""}`}
                            onClick={() => setFilterStatus(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="ride-bill-segments ride-bill-toolbar__export-wrap">
                      <button
                        type="button"
                        className="ride-bill-segments__btn ride-bill-segments__btn--active"
                        onClick={() => setShowAddModal(true)}
                        aria-label="Add user"
                      >
                        + Add User
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="users-table-container">
                {filteredUsers.length === 0 ? (
                  <EmptyState
                    message={filterEmptyMessage}
                    iconName="search"
                    onAction={() => {
                      setSearchTerm("");
                      setDebouncedSearch("");
                      setFilterRole("all");
                      setFilterStatus("all");
                    }}
                    actionLabel="Clear search & filters"
                  />
                ) : (
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Profile</th>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user) => (
                        <tr key={user._id}>
                          <td>
                            <AuthenticatedProfileImage
                              raw={user.profilePicture}
                              alt={user.name || user.username}
                              fallbackInitial={
                                user.name?.[0]?.toUpperCase() ||
                                user.username[0]?.toUpperCase() ||
                                "?"
                              }
                              size={40}
                            />
                          </td>
                          <td>{user.name || "-"}</td>
                          <td>
                            {user.role?.toLowerCase() === "driver"
                              ? "-"
                              : user.username}
                          </td>
                          <td>
                            {user.role?.toLowerCase() === "driver"
                              ? "-"
                              : user.email}
                          </td>
                          <td>
                            <span
                              className={`role-badge role-${user.role.toLowerCase()}`}
                            >
                              {formatRoleLabel(user.role)}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`status-badge status-${(user.status || "active").toLowerCase()} ${
                                canModifyTargetUser(user)
                                  ? "status-badge--interactive"
                                  : "status-badge--static"
                              }`}
                              onClick={(e) =>
                                canModifyTargetUser(user)
                                  ? handleStatusClick(e, user)
                                  : undefined
                              }
                              title={
                                canModifyTargetUser(user)
                                  ? "Click to change status"
                                  : "Cannot change status of Super Admin users"
                              }
                            >
                              {user.status || "active"}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              {roleHasViewAction(user.role) ? (
                                <button
                                  type="button"
                                  className="action-btn view"
                                  onClick={() => setViewingUser(user)}
                                >
                                  View
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="action-btn edit"
                                onClick={() => handleEdit(user)}
                                title="Edit user"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="action-btn delete"
                                onClick={() => handleDelete(user._id)}
                                disabled={!canModifyTargetUser(user)}
                                title={
                                  !canModifyTargetUser(user)
                                    ? "Cannot delete Super Admin users"
                                    : "Delete user"
                                }
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

              {listIdle && filteredUsers.length > 0 ? (
                <div
                  className="users-pagination"
                  role="navigation"
                  aria-label="User list pagination"
                >
                  <div className="users-pagination__size">
                    <label htmlFor="users-page-size">Rows per page</label>
                    <select
                      id="users-page-size"
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
                          aria-current={
                            page === currentPage ? "page" : undefined
                          }
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

      {showAddModal && (
        <UserModal
          user={editingUser}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}

      {viewingUser && (
        <ViewUserModal
          key={viewingUser._id}
          user={viewingUser}
          onClose={() => setViewingUser(null)}
        />
      )}

      {statusChangeUser && statusChangePosition && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
            }}
            onClick={() => {
              setStatusChangeUser(null);
              setStatusChangePosition(null);
            }}
          />
          <div
            style={{
              position: "fixed",
              left: `${statusChangePosition.x}px`,
              top: `${statusChangePosition.y}px`,
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.5rem",
              padding: "0.5rem",
              zIndex: 1001,
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              minWidth: "120px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "0.5rem",
                cursor: "pointer",
                borderRadius: "0.25rem",
                color:
                  statusChangeUser.status === "active"
                    ? "#10b981"
                    : "var(--text-primary)",
              }}
              onClick={() => handleStatusChange(statusChangeUser._id, "active")}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              Active
            </div>
            <div
              style={{
                padding: "0.5rem",
                cursor: canChangePendingStatus ? "pointer" : "not-allowed",
                borderRadius: "0.25rem",
                color: !canChangePendingStatus
                  ? "var(--text-tertiary)"
                  : statusChangeUser.status === "inactive"
                    ? "#6b7280"
                    : "var(--text-primary)",
                opacity: canChangePendingStatus ? 1 : 0.5,
              }}
              onClick={() =>
                canChangePendingStatus &&
                handleStatusChange(statusChangeUser._id, "inactive")
              }
              onMouseEnter={(e) => {
                if (canChangePendingStatus) {
                  e.currentTarget.style.background = "var(--bg-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              title={
                canChangePendingStatus
                  ? "Set to inactive"
                  : "Cannot change Super Admin status"
              }
            >
              Inactive
            </div>
            <div
              style={{
                padding: "0.5rem",
                cursor: canChangePendingStatus ? "pointer" : "not-allowed",
                borderRadius: "0.25rem",
                color: !canChangePendingStatus
                  ? "var(--text-tertiary)"
                  : statusChangeUser.status === "expired"
                    ? "#f59e0b"
                    : "var(--text-primary)",
                opacity: canChangePendingStatus ? 1 : 0.5,
              }}
              onClick={() =>
                canChangePendingStatus &&
                handleStatusChange(statusChangeUser._id, "expired")
              }
              onMouseEnter={(e) => {
                if (canChangePendingStatus) {
                  e.currentTarget.style.background = "var(--bg-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              title={
                canChangePendingStatus
                  ? "Set to expired"
                  : "Cannot change Super Admin status"
              }
            >
              Expired
            </div>
            <div
              style={{
                padding: "0.5rem",
                cursor: canChangePendingStatus ? "pointer" : "not-allowed",
                borderRadius: "0.25rem",
                color: !canChangePendingStatus
                  ? "var(--text-tertiary)"
                  : statusChangeUser.status === "closed"
                    ? "#ef4444"
                    : "var(--text-primary)",
                opacity: canChangePendingStatus ? 1 : 0.5,
              }}
              onClick={() =>
                canChangePendingStatus &&
                handleStatusChange(statusChangeUser._id, "closed")
              }
              onMouseEnter={(e) => {
                if (canChangePendingStatus) {
                  e.currentTarget.style.background = "var(--bg-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              title={
                canChangePendingStatus
                  ? "Set to closed"
                  : "Cannot change Super Admin status"
              }
            >
              Closed
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Users;
