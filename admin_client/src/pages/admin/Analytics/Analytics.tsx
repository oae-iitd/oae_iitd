import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { rideBillsService } from "../../../services/ride-bills/ride-bills.service";
import type { RideBill } from "../../../services/ride-bills/ride-bills.service";
import httpClient from "../../../services/api/http";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import "../Users/Users.css";
import "../RideBill/RideBill.css";
import "./Analytics.css";
import { AnimatedNumber, EdgeStateView } from "../../../components/common";

type TimePeriod =
  | "Today"
  | "Yesterday"
  | "This Week"
  | "This Month"
  | "This Year"
  | "Custom";

type ChartScope = "all" | "payment" | "ride" | "driver" | "student" | "route";

function truncateChartLabel(s: string, max = 28): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

const BAR_ANIMATION = {
  isAnimationActive: true,
  animationDuration: 720,
  animationEasing: "ease-out" as const,
};

const SIDEBAR_BAR_ANIMATION = {
  isAnimationActive: true,
  animationDuration: 580,
  animationEasing: "ease-out" as const,
};

const AREA_ANIMATION = {
  isAnimationActive: true,
  animationDuration: 900,
  animationEasing: "ease-out" as const,
};

type SidebarChartRow = { name: string; fullName: string; rides: number };

const AnalyticsSidebarMiniChart: React.FC<{
  rows: SidebarChartRow[];
  emptyLabel: string;
  yAxisWidth: number;
  tooltipStyle: React.CSSProperties;
  palette: string[];
}> = ({ rows, emptyLabel, yAxisWidth, tooltipStyle, palette }) => {
  const [miniHeight, setMiniHeight] = useState(200);
  const chartData = useMemo(() => [...rows].reverse(), [rows]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setMiniHeight(mq.matches ? 152 : 200);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (rows.length === 0) {
    return (
      <div
        className="analytics-sidebar-mini-chart analytics-sidebar-mini-chart--empty"
        role="img"
        aria-label={emptyLabel}
      >
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="analytics-sidebar-mini-chart">
      <ResponsiveContainer width="100%" height={miniHeight}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--card-border)"
            horizontal={false}
          />
          <XAxis
            type="number"
            stroke="var(--text-secondary)"
            tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={yAxisWidth}
            stroke="var(--text-secondary)"
            tick={{ fontSize: 9, fill: "var(--text-secondary)" }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: unknown) => [
              typeof v === "number" ? v : Number(v),
              "Rides",
            ]}
            labelFormatter={(_l, p) =>
              String(
                (p?.[0]?.payload as SidebarChartRow | undefined)?.fullName ??
                  _l,
              )
            }
          />
          <Bar dataKey="rides" radius={[0, 4, 4, 0]} {...SIDEBAR_BAR_ANIMATION}>
            {chartData.map((_, i) => (
              <Cell
                key={`sb-${i}`}
                fill={palette[(rows.length - 1 - i) % palette.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const formatDMMyy = (d: Date): string => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

function filterByPeriod(
  bills: RideBill[] | null | undefined,
  period: TimePeriod,
  startDate: Date | null,
  endDate: Date | null,
): RideBill[] {
  const now = new Date();
  const safeBills = Array.isArray(bills) ? bills : [];
  return safeBills.filter((bill) => {
    const d = new Date(bill.createdAt);
    switch (period) {
      case "Today":
        return d.toDateString() === now.toDateString();
      case "Yesterday": {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        return d.toDateString() === yesterday.toDateString();
      }
      case "This Week": {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return d >= weekStart;
      }
      case "This Month":
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      case "This Year":
        return d.getFullYear() === now.getFullYear();
      case "Custom":
        if (startDate && endDate) return d >= startDate && d <= endDate;
        return true;
      default:
        return true;
    }
  });
}

function pickTicks<T extends Record<string, unknown>>(
  data: T[],
  key: string,
  max = 6,
): string[] {
  if (data.length === 0) return [];
  if (data.length <= max) return data.map((d) => String(d[key]));
  const result: string[] = [String(data[0][key])];
  const step = Math.floor((data.length - 1) / (max - 1));
  for (let i = step; i < data.length - 1; i += step) {
    if (result.length < max - 1) result.push(String(data[i][key]));
  }
  const last = String(data[data.length - 1][key]);
  if (!result.includes(last)) result.push(last);
  return result;
}

function resolveDriverName(
  driver: RideBill["driver"],
  cache: Record<string, string>,
): string | undefined {
  if (!driver) return undefined;
  if (typeof driver === "string") {
    return driver.includes(" ") ? driver : (cache[driver] ?? driver);
  }
  return driver.name || driver.username || cache[driver._id] || driver._id;
}

function routeLabel(b: Pick<RideBill, "fromLocation" | "toLocation">): string {
  const from = (b.fromLocation || "").trim() || "—";
  const to = (b.toLocation || "").trim() || "—";
  return `${from} → ${to}`;
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

type AnalyticsTrendMode = "payments" | "rides";

/** Sum of bill `fare` (₹) per bucket vs ride counts; matches “Ride Payments” in the UI. */
function buildAnalyticsTimeSeries(
  filtered: RideBill[],
  selectedPeriod: TimePeriod,
  startDate: Date | null,
  endDate: Date | null,
  mode: AnalyticsTrendMode,
): Record<string, unknown>[] {
  const now = new Date();
  const apply = (row: { payments?: number; rides?: number }, b: RideBill) => {
    if (mode === "payments") row.payments = (row.payments ?? 0) + b.fare;
    else row.rides = (row.rides ?? 0) + 1;
  };

  switch (selectedPeriod) {
    case "Today":
    case "Yesterday": {
      const targetDate =
        selectedPeriod === "Yesterday"
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
          : now;
      const maxHour = selectedPeriod === "Yesterday" ? 23 : now.getHours();
      const data = Array.from({ length: maxHour + 1 }, (_, i) => {
        const time =
          i === maxHour && selectedPeriod === "Today"
            ? "Now"
            : `${i.toString().padStart(2, "0")}:00`;
        return mode === "payments" ? { time, payments: 0 } : { time, rides: 0 };
      });
      filtered.forEach((b) => {
        const h = new Date(b.createdAt).getHours();
        const bd = new Date(b.createdAt);
        if (
          bd.toDateString() === targetDate.toDateString() &&
          h < data.length
        ) {
          apply(data[h] as { payments?: number; rides?: number }, b);
        }
      });
      return data;
    }
    case "This Week": {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const endIdx = now.getDay();
      const data = days.slice(0, endIdx + 1).map((day, i) => {
        const dayLabel = i === endIdx ? "Now" : day;
        return mode === "payments"
          ? { day: dayLabel, payments: 0 }
          : { day: dayLabel, rides: 0 };
      });
      filtered.forEach((b) => {
        const idx = new Date(b.createdAt).getDay();
        if (idx < data.length)
          apply(data[idx] as { payments?: number; rides?: number }, b);
      });
      return data;
    }
    case "This Month": {
      const elapsed = now.getDate();
      const data = Array.from({ length: elapsed }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
        const dayLabel = i + 1 === elapsed ? "Now" : formatDMMyy(d);
        return mode === "payments"
          ? { day: dayLabel, payments: 0 }
          : { day: dayLabel, rides: 0 };
      });
      filtered.forEach((b) => {
        const dom = new Date(b.createdAt).getDate();
        if (dom >= 1 && dom <= elapsed)
          apply(data[dom - 1] as { payments?: number; rides?: number }, b);
      });
      return data;
    }
    case "This Year": {
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const last = now.getMonth();
      const data = months.slice(0, last + 1).map((m, i) => {
        const monthLabel = i === last ? "Now" : m;
        return mode === "payments"
          ? { month: monthLabel, payments: 0 }
          : { month: monthLabel, rides: 0 };
      });
      filtered.forEach((b) => {
        const m = new Date(b.createdAt).getMonth();
        if (m < data.length)
          apply(data[m] as { payments?: number; rides?: number }, b);
      });
      return data;
    }
    case "Custom": {
      if (!startDate || !endDate || startDate > endDate) return [];
      const daysDiff =
        Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
      const weekly = daysDiff > 90;
      const step = weekly ? 7 : 1;
      const pts = Math.ceil(daysDiff / step);
      const data = Array.from({ length: pts }, (_, i) => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i * step);
        if (d > endDate) d.setTime(endDate.getTime());
        const day = weekly ? `Week ${i + 1}` : formatDMMyy(d);
        return mode === "payments"
          ? { day, payments: 0, _d: d }
          : { day, rides: 0, _d: d };
      });
      filtered.forEach((b) => {
        const bd = new Date(b.createdAt);
        const idx = weekly
          ? Math.floor((bd.getTime() - startDate.getTime()) / (86400000 * 7))
          : Math.floor((bd.getTime() - startDate.getTime()) / 86400000);
        if (idx >= 0 && idx < data.length)
          apply(data[idx] as { payments?: number; rides?: number }, b);
      });
      return mode === "payments"
        ? data.map(({ day, payments }) => ({ day, payments }))
        : data.map(({ day, rides }) => ({ day, rides }));
    }
    default:
      return [];
  }
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

const Analytics: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] =
    useState<TimePeriod>("This Month");
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [rideBills, setRideBills] = useState<RideBill[]>([]);
  const [driversCache, setDriversCache] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [billsError, setBillsError] = useState<string | null>(null);
  const isOnline = useIsOnline();

  const [pairDriver, setPairDriver] = useState("");
  const [pairStudent, setPairStudent] = useState("");
  const [pairRoute, setPairRoute] = useState("");
  const [pairStatus, setPairStatus] = useState("");
  const [chartScope, setChartScope] = useState<ChartScope>("all");

  const loadRideBills = useCallback(() => {
    setBillsError(null);
    setIsLoading(true);
    rideBillsService
      .getRideBills()
      .then((bills) => setRideBills(Array.isArray(bills) ? bills : []))
      .catch((err) => {
        console.error("Failed to fetch ride bills:", err);
        setBillsError(parseApiError(err, "Failed to load ride bills."));
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    queueMicrotask(loadRideBills);
  }, [loadRideBills]);

  useEffect(() => {
    httpClient
      .get<Array<{ _id: string; name: string }>>(API_ENDPOINTS.DRIVERS.BASE)
      .then((res) => {
        const map: Record<string, string> = {};
        (res.data ?? []).forEach((d) => {
          if (d._id && d.name) map[d._id] = d.name;
        });
        setDriversCache(map);
      })
      .catch((err) => console.error("Failed to fetch drivers:", err));
  }, []);

  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(e.target as Node)
      ) {
        setShowCalendar(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  const periodSubtitle = useMemo((): string => {
    const now = new Date();
    switch (selectedPeriod) {
      case "Today":
        return formatDMMyy(now);
      case "Yesterday": {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        return formatDMMyy(yesterday);
      }
      case "This Week": {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        return `${formatDMMyy(weekStart)} – Now`;
      }
      case "This Month": {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return `${formatDMMyy(monthStart)} – Now`;
      }
      case "This Year": {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return `${formatDMMyy(yearStart)} – Now`;
      }
      case "Custom":
        if (startDate && endDate)
          return `${formatDMMyy(startDate)} – ${formatDMMyy(endDate)}`;
        return "";
      default:
        return "";
    }
  }, [selectedPeriod, startDate, endDate]);

  const allDriverNames = useMemo(() => {
    const names = new Set<string>();
    rideBills.forEach((b) => {
      const name = resolveDriverName(b.driver, driversCache);
      if (name) names.add(name);
    });
    return [...names].sort();
  }, [rideBills, driversCache]);

  const allStudents = useMemo(() => {
    const map = new Map<string, string>();
    rideBills.forEach((b) => {
      const uid = typeof b.userId === "object" ? b.userId._id : b.userId;
      if (!uid || map.has(uid)) return;
      const label =
        typeof b.userId === "object"
          ? b.userId.name ||
            b.userId.username ||
            b.userId.enrollmentNumber ||
            uid
          : uid;
      map.set(uid, label);
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rideBills]);

  const allRoutes = useMemo(() => {
    const routes = new Set<string>();
    rideBills.forEach((b) => routes.add(routeLabel(b)));
    return [...routes].sort((a, b) => a.localeCompare(b));
  }, [rideBills]);

  const pairFilteredBills = useMemo(() => {
    if (!pairDriver && !pairStudent && !pairRoute && !pairStatus)
      return rideBills;
    return rideBills.filter((b) => {
      if (pairDriver) {
        const name = resolveDriverName(b.driver, driversCache);
        if (name !== pairDriver) return false;
      }
      if (pairStudent) {
        const uid = typeof b.userId === "object" ? b.userId._id : b.userId;
        if (uid !== pairStudent) return false;
      }
      if (pairRoute && routeLabel(b) !== pairRoute) return false;
      if (pairStatus && b.status !== pairStatus) return false;
      return true;
    });
  }, [rideBills, pairDriver, pairStudent, pairRoute, pairStatus, driversCache]);

  const secondaryRoutes = useMemo(() => {
    if (!pairDriver && !pairStudent) return allRoutes;
    const routes = new Set<string>();
    rideBills.forEach((b) => {
      if (
        pairDriver &&
        resolveDriverName(b.driver, driversCache) !== pairDriver
      )
        return;
      if (pairStudent) {
        const uid = typeof b.userId === "object" ? b.userId._id : b.userId;
        if (uid !== pairStudent) return;
      }
      routes.add(routeLabel(b));
    });
    return [...routes].sort((a, b) => a.localeCompare(b));
  }, [rideBills, pairDriver, pairStudent, allRoutes, driversCache]);

  const pairPeriodBillCount = useMemo(
    () =>
      filterByPeriod(pairFilteredBills, selectedPeriod, startDate, endDate)
        .length,
    [pairFilteredBills, selectedPeriod, startDate, endDate],
  );

  useEffect(() => {
    if (pairRoute && !secondaryRoutes.includes(pairRoute)) {
      queueMicrotask(() => setPairRoute(""));
    }
  }, [pairRoute, secondaryRoutes]);

  const secondaryStudents = useMemo(() => {
    if (!pairDriver) return allStudents;
    const map = new Map<string, string>();
    rideBills.forEach((b) => {
      if (resolveDriverName(b.driver, driversCache) !== pairDriver) return;
      const uid = typeof b.userId === "object" ? b.userId._id : b.userId;
      if (!uid || map.has(uid)) return;
      const label =
        typeof b.userId === "object"
          ? b.userId.name ||
            b.userId.username ||
            b.userId.enrollmentNumber ||
            uid
          : uid;
      map.set(uid, label);
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rideBills, pairDriver, allStudents, driversCache]);

  const secondaryDriverNames = useMemo(() => {
    if (!pairStudent) return allDriverNames;
    const names = new Set<string>();
    rideBills.forEach((b) => {
      const uid = typeof b.userId === "object" ? b.userId._id : b.userId;
      if (uid !== pairStudent) return;
      const name = resolveDriverName(b.driver, driversCache);
      if (name) names.add(name);
    });
    return [...names].sort();
  }, [rideBills, pairStudent, allDriverNames, driversCache]);

  useEffect(() => {
    if (!pairStudent || !pairDriver) return;
    if (!secondaryDriverNames.includes(pairDriver)) {
      queueMicrotask(() => setPairDriver(""));
    }
  }, [pairStudent, pairDriver, secondaryDriverNames]);

  useEffect(() => {
    if (!pairDriver || !pairStudent) return;
    if (!secondaryStudents.some((s) => s.id === pairStudent)) {
      queueMicrotask(() => setPairStudent(""));
    }
  }, [pairDriver, pairStudent, secondaryStudents]);

  const paymentsSeries = useMemo(() => {
    if (isLoading || !pairFilteredBills.length) return [];
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    return buildAnalyticsTimeSeries(
      filtered,
      selectedPeriod,
      startDate,
      endDate,
      "payments",
    );
  }, [pairFilteredBills, selectedPeriod, startDate, endDate, isLoading]);

  const rideDistributionData = useMemo(() => {
    if (isLoading || !pairFilteredBills.length) return [];
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    return buildAnalyticsTimeSeries(
      filtered,
      selectedPeriod,
      startDate,
      endDate,
      "rides",
    );
  }, [pairFilteredBills, selectedPeriod, startDate, endDate, isLoading]);

  const topRoutes = useMemo(() => {
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    const counts = new Map<string, number>();
    filtered.forEach((b) => {
      const key = routeLabel(b);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, rides]) => ({ route, rides }));
  }, [pairFilteredBills, selectedPeriod, startDate, endDate]);

  const topDrivers = useMemo(() => {
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    const counts = new Map<string, number>();
    filtered.forEach((b) => {
      const name = resolveDriverName(b.driver, driversCache);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([driver, rides]) => ({ driver, rides }));
  }, [pairFilteredBills, selectedPeriod, startDate, endDate, driversCache]);

  const topStudents = useMemo(() => {
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    const map = new Map<string, { name: string; rides: number }>();
    filtered.forEach((b) => {
      const uid = typeof b.userId === "object" ? b.userId._id : b.userId;
      if (!uid) return;
      const name =
        typeof b.userId === "object"
          ? b.userId.name ||
            b.userId.username ||
            b.userId.enrollmentNumber ||
            uid
          : uid;
      const prev = map.get(uid);
      map.set(uid, { name, rides: (prev?.rides ?? 0) + 1 });
    });
    return [...map.entries()]
      .sort((a, b) => b[1].rides - a[1].rides)
      .slice(0, 5)
      .map(([id, v]) => ({ id, name: v.name, rides: v.rides }));
  }, [pairFilteredBills, selectedPeriod, startDate, endDate]);

  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const driverStats = useMemo(() => {
    if (!selectedDriver) return null;
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    const bills = filtered.filter(
      (b) => resolveDriverName(b.driver, driversCache) === selectedDriver,
    );

    const totalRides = bills.length;
    const totalPayments = bills.reduce((s, b) => s + (b.fare || 0), 0);
    const requested = bills.filter((b) => b.status === "requested").length;
    const active = bills.filter((b) => b.status === "arrived" || b.status === "in_progress").length;
    const cancelled = bills.filter((b) => b.status === "cancelled").length;

    const routeCounts = new Map<string, number>();
    bills.forEach((b) => {
      const route = routeLabel(b);
      routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
    });
    const topRoutes = [...routeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([route, count]) => ({ route, count }));

    const studentMap = new Map<string, { name: string; rides: number }>();
    bills.forEach((b) => {
      const uid = typeof b.userId === "object" ? b.userId._id : b.userId;
      const name =
        typeof b.userId === "object"
          ? b.userId.name ||
            b.userId.username ||
            b.userId.enrollmentNumber ||
            uid
          : uid;
      const prev = studentMap.get(uid);
      studentMap.set(uid, { name, rides: (prev?.rides ?? 0) + 1 });
    });
    const topStudents = [...studentMap.values()]
      .sort((a, b) => b.rides - a.rides)
      .slice(0, 4);

    return {
      totalRides,
      totalPayments,
      requested,
      active,
      cancelled,
      topRoutes,
      topStudents,
    };
  }, [
    selectedDriver,
    pairFilteredBills,
    selectedPeriod,
    startDate,
    endDate,
    driversCache,
  ]);

  const studentStats = useMemo(() => {
    if (!selectedStudent) return null;
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    const bills = filtered.filter((b) => {
      const uid = typeof b.userId === "object" ? b.userId._id : b.userId;
      return uid === selectedStudent;
    });

    const totalRides = bills.length;
    const totalPayments = bills.reduce((s, b) => s + (b.fare || 0), 0);
    const requested = bills.filter((b) => b.status === "requested").length;
    const active = bills.filter((b) => b.status === "arrived" || b.status === "in_progress").length;
    const cancelled = bills.filter((b) => b.status === "cancelled").length;

    const routeCounts = new Map<string, number>();
    bills.forEach((b) => {
      const route = routeLabel(b);
      routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
    });
    const topRoutesForStudent = [...routeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([route, count]) => ({ route, count }));

    const driverCounts = new Map<string, number>();
    bills.forEach((b) => {
      const name = resolveDriverName(b.driver, driversCache);
      if (name) driverCounts.set(name, (driverCounts.get(name) ?? 0) + 1);
    });
    const topDriversForStudent = [...driverCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([driver, rides]) => ({ driver, rides }));

    return {
      totalRides,
      totalPayments,
      requested,
      active,
      cancelled,
      topRoutes: topRoutesForStudent,
      topDrivers: topDriversForStudent,
      studentName: bills[0]
        ? typeof bills[0].userId === "object"
          ? bills[0].userId.name ||
            bills[0].userId.username ||
            bills[0].userId.enrollmentNumber ||
            selectedStudent
          : selectedStudent
        : selectedStudent,
    };
  }, [
    selectedStudent,
    pairFilteredBills,
    selectedPeriod,
    startDate,
    endDate,
    driversCache,
  ]);

  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  const routeStats = useMemo(() => {
    if (!selectedRoute) return null;
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    const bills = filtered.filter((b) => routeLabel(b) === selectedRoute);

    const totalRides = bills.length;
    const totalPayments = bills.reduce((s, b) => s + (b.fare || 0), 0);
    const requested = bills.filter((b) => b.status === "requested").length;
    const active = bills.filter((b) => b.status === "arrived" || b.status === "in_progress").length;
    const cancelled = bills.filter((b) => b.status === "cancelled").length;

    return { totalRides, totalPayments, requested, active, cancelled };
  }, [selectedRoute, pairFilteredBills, selectedPeriod, startDate, endDate]);

  const driverScopeChartData = useMemo(() => {
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    const map = new Map<string, { rides: number; payments: number }>();
    filtered.forEach((b) => {
      const name = resolveDriverName(b.driver, driversCache);
      if (!name) return;
      const prev = map.get(name) ?? { rides: 0, payments: 0 };
      prev.rides += 1;
      prev.payments += b.fare || 0;
      map.set(name, prev);
    });
    return [...map.entries()]
      .sort((a, b) => b[1].rides - a[1].rides)
      .slice(0, 12)
      .map(([fullName, v]) => ({
        name: truncateChartLabel(fullName, 26),
        fullName,
        rides: v.rides,
        payments: v.payments,
      }));
  }, [pairFilteredBills, selectedPeriod, startDate, endDate, driversCache]);

  const studentScopeChartData = useMemo(() => {
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    const map = new Map<
      string,
      { label: string; rides: number; payments: number }
    >();
    filtered.forEach((b) => {
      const uid = typeof b.userId === "object" ? b.userId._id : b.userId;
      const fullLabel =
        typeof b.userId === "object"
          ? b.userId.name ||
            b.userId.username ||
            b.userId.enrollmentNumber ||
            uid
          : uid;
      const key = uid || String(fullLabel);
      const prev = map.get(key) ?? {
        label: String(fullLabel),
        rides: 0,
        payments: 0,
      };
      prev.rides += 1;
      prev.payments += b.fare || 0;
      map.set(key, prev);
    });
    return [...map.values()]
      .sort((a, b) => b.rides - a.rides)
      .slice(0, 12)
      .map((r) => ({
        name: truncateChartLabel(r.label, 26),
        fullName: r.label,
        rides: r.rides,
        payments: r.payments,
      }));
  }, [pairFilteredBills, selectedPeriod, startDate, endDate]);

  const routeScopeChartData = useMemo(() => {
    const filtered = filterByPeriod(
      pairFilteredBills,
      selectedPeriod,
      startDate,
      endDate,
    );
    const counts = new Map<string, number>();
    filtered.forEach((b) => {
      const key = routeLabel(b);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([fullName, rides]) => ({
        name: truncateChartLabel(fullName, 36),
        fullName,
        rides,
      }));
  }, [pairFilteredBills, selectedPeriod, startDate, endDate]);

  const chartCategoryKey =
    selectedPeriod === "This Year"
      ? "month"
      : selectedPeriod === "Today" || selectedPeriod === "Yesterday"
        ? "time"
        : "day";
  const paymentsTicks = pickTicks(
    paymentsSeries as Record<string, unknown>[],
    chartCategoryKey,
  );
  const rideTicks = pickTicks(
    rideDistributionData as Record<string, unknown>[],
    chartCategoryKey,
  );

  const recapInsights = useMemo(() => {
    const peakPaymentsPt = (
      paymentsSeries as Array<Record<string, unknown>>
    ).reduce<Record<string, unknown> | null>(
      (max, d) =>
        !max || (d.payments as number) > (max.payments as number) ? d : max,
      null,
    );
    const peakPaymentsLabel = peakPaymentsPt
      ? String(peakPaymentsPt[chartCategoryKey])
      : "—";
    const peakPaymentsValue = peakPaymentsPt
      ? (peakPaymentsPt.payments as number)
      : 0;

    const peakRidePt = (
      rideDistributionData as Array<Record<string, unknown>>
    ).reduce<Record<string, unknown> | null>(
      (max, d) =>
        !max || (d.rides as number) > (max.rides as number) ? d : max,
      null,
    );
    const peakRideLabel = peakRidePt
      ? String(peakRidePt[chartCategoryKey])
      : "—";
    const peakRideValue = peakRidePt ? (peakRidePt.rides as number) : 0;

    return {
      peakPaymentsLabel,
      peakPaymentsValue,
      topRoute: topRoutes[0] ?? null,
      peakRideLabel,
      peakRideValue,
      topDriver: topDrivers[0] ?? null,
      topStudent: topStudents[0] ?? null,
    };
  }, [
    paymentsSeries,
    rideDistributionData,
    topRoutes,
    topDrivers,
    topStudents,
    chartCategoryKey,
  ]);

  const barPalette = ["#3b82f6", "#22c55e", "#f97316", "#ef4444", "#a855f7"];
  const driverSidebarChartRows = useMemo(
    (): SidebarChartRow[] =>
      topDrivers.map((d) => ({
        name: truncateChartLabel(d.driver, 20),
        fullName: d.driver,
        rides: d.rides,
      })),
    [topDrivers],
  );

  const studentSidebarChartRows = useMemo(
    (): SidebarChartRow[] =>
      topStudents.map((s) => ({
        name: truncateChartLabel(s.name, 20),
        fullName: s.name,
        rides: s.rides,
      })),
    [topStudents],
  );

  const routeSidebarChartRows = useMemo(
    (): SidebarChartRow[] =>
      topRoutes.map((r) => ({
        name: truncateChartLabel(r.route, 24),
        fullName: r.route,
        rides: r.rides,
      })),
    [topRoutes],
  );

  const tooltipStyle = {
    backgroundColor: "var(--card-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: "8px",
    color: "var(--text-primary)",
  };

  const timePeriods: TimePeriod[] = [
    "Today",
    "Yesterday",
    "This Week",
    "This Month",
    "This Year",
  ];

  const mainChartTitle =
    chartScope === "all"
      ? "Ride Payments & Ride Distribution"
      : chartScope === "payment"
        ? "Ride Payments"
        : chartScope === "ride"
          ? "Ride Distribution"
          : chartScope === "driver"
            ? "Drivers"
            : chartScope === "student"
              ? "Students"
              : "Routes";

  const pairActive = !!(pairDriver || pairStudent || pairRoute || pairStatus);

  return (
    <div
      className="users-page analytics-page"
      aria-busy={isLoading || undefined}
    >
      <EdgeStateView
        loading={isLoading}
        error={billsError}
        onRetry={loadRideBills}
        retryLabel="Try again"
        loadingMessage="Loading analytics…"
        loadingVariant="page"
        empty={!isLoading && !billsError && rideBills.length === 0}
        emptyMessage="No ride bills yet. Charts and rankings will appear once rides are recorded."
        onEmptyAction={loadRideBills}
        emptyActionLabel="Refresh"
        isOnline={isOnline}
      >
        <div className="recap-section" aria-label="Analytics summary">
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
                <polyline points="2 14 7 9 11 13 18 6" />
                <line x1="14" y1="6" x2="18" y2="6" />
                <line x1="18" y1="6" x2="18" y2="10" />
              </svg>
            </div>
            <div className="recap-body">
              <div className="recap-label">Ride Payments</div>
              <div className="recap-value">
                Peak{" "}
                <AnimatedNumber
                  value={recapInsights.peakPaymentsValue}
                  format={(n) =>
                    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                  }
                />
              </div>
              <div className="recap-sub">
                at {recapInsights.peakPaymentsLabel}
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
                <path d="M10 2a6 6 0 0 1 6 6c0 4-6 10-6 10S4 12 4 8a6 6 0 0 1 6-6z" />
                <circle cx="10" cy="8" r="2" />
              </svg>
            </div>
            <div className="recap-body">
              <div className="recap-label">Top Route</div>
              <div className="recap-value recap-value--truncate">
                {recapInsights.topRoute?.route ?? "—"}
              </div>
              <div className="recap-sub">
                <AnimatedNumber value={recapInsights.topRoute?.rides ?? 0} />{" "}
                rides
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
                <rect x="2" y="12" width="3" height="6" rx="1" />
                <rect x="8.5" y="8" width="3" height="10" rx="1" />
                <rect x="15" y="4" width="3" height="14" rx="1" />
              </svg>
            </div>
            <div className="recap-body">
              <div className="recap-label">Ride Distribution</div>
              <div className="recap-value">
                Peak <AnimatedNumber value={recapInsights.peakRideValue} />{" "}
                rides
              </div>
              <div className="recap-sub">at {recapInsights.peakRideLabel}</div>
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
              <div className="recap-label">Drivers Analysis</div>
              <div className="recap-value recap-value--truncate">
                {recapInsights.topDriver?.driver ?? "—"}
              </div>
              <div className="recap-sub">
                <AnimatedNumber value={recapInsights.topDriver?.rides ?? 0} />{" "}
                rides
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
              <div className="recap-label">Students Analysis</div>
              <div className="recap-value recap-value--truncate">
                {recapInsights.topStudent?.name ?? "—"}
              </div>
              <div className="recap-sub">
                <AnimatedNumber value={recapInsights.topStudent?.rides ?? 0} />{" "}
                rides
              </div>
            </div>
          </div>
        </div>

        <div
          className={`page-header analytics-page__header ${pairActive ? "analytics-page__header--filters-active" : ""}`}
        >
          <div
            className="ride-bill-toolbar users-toolbar analytics-toolbar-strip"
            role="search"
          >
            <div className="ride-bill-segments ride-bill-toolbar__select-wrap analytics-toolbar__filter analytics-toolbar__filter--chart-scope">
              <select
                id="chart-scope"
                className="ride-bill-toolbar__select"
                value={chartScope}
                onChange={(e) => setChartScope(e.target.value as ChartScope)}
                aria-label="Chart focus"
              >
                <option value="all">All</option>
                <option value="payment">Ride Payments</option>
                <option value="ride">Ride Distribution</option>
                <option value="driver">All drivers</option>
                <option value="student">All students</option>
                <option value="route">All routes</option>
              </select>
            </div>
            <div className="ride-bill-toolbar__time-range analytics-toolbar-period-block">
              <div className="ride-bill-toolbar__time-range analytics-toolbar-period__inner">
                <div
                  className="ride-bill-segments"
                  role="group"
                  aria-label="Time period"
                >
                  {timePeriods.map((period) => (
                    <button
                      key={period}
                      type="button"
                      className={`ride-bill-segments__btn ${selectedPeriod === period ? "ride-bill-segments__btn--active" : ""}`}
                      onClick={() => {
                        setSelectedPeriod(period);
                        setShowCalendar(false);
                        const today = new Date();
                        if (period === "Today") {
                          setStartDate(new Date(today.setHours(0, 0, 0, 0)));
                          setEndDate(new Date());
                        } else if (period === "Yesterday") {
                          const y = new Date(today);
                          y.setDate(today.getDate() - 1);
                          y.setHours(0, 0, 0, 0);
                          setStartDate(y);
                          setEndDate(
                            new Date(
                              y.getFullYear(),
                              y.getMonth(),
                              y.getDate(),
                              23,
                              59,
                              59,
                            ),
                          );
                        } else if (period === "This Week") {
                          const ws = new Date(today);
                          ws.setDate(today.getDate() - today.getDay());
                          ws.setHours(0, 0, 0, 0);
                          setStartDate(ws);
                          setEndDate(new Date());
                        } else if (period === "This Month") {
                          setStartDate(
                            new Date(today.getFullYear(), today.getMonth(), 1),
                          );
                          setEndDate(new Date());
                        } else if (period === "This Year") {
                          setStartDate(new Date(today.getFullYear(), 0, 1));
                          setEndDate(new Date());
                        }
                      }}
                    >
                      {period}
                    </button>
                  ))}
                  <div
                    className="ride-bill-calendar-container"
                    ref={calendarRef}
                  >
                    <button
                      type="button"
                      className={`ride-bill-segments__btn ride-bill-segments__btn--calendar ${selectedPeriod === "Custom" ? "ride-bill-segments__btn--active" : ""}`}
                      onClick={() => setShowCalendar(!showCalendar)}
                      aria-label="Custom date range"
                      title="Pick a custom date range"
                      aria-expanded={showCalendar}
                    >
                      <svg
                        className="ride-bill-calendar-icon"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="2.5" y="3.5" width="15" height="14" rx="2" />
                        <line x1="6.5" y1="2" x2="6.5" y2="5" />
                        <line x1="13.5" y1="2" x2="13.5" y2="5" />
                        <line x1="2.5" y1="8" x2="17.5" y2="8" />
                        <circle
                          cx="6.5"
                          cy="11.5"
                          r="0.8"
                          fill="currentColor"
                          stroke="none"
                        />
                        <circle
                          cx="10"
                          cy="11.5"
                          r="0.8"
                          fill="currentColor"
                          stroke="none"
                        />
                        <circle
                          cx="13.5"
                          cy="11.5"
                          r="0.8"
                          fill="currentColor"
                          stroke="none"
                        />
                        <circle
                          cx="6.5"
                          cy="15"
                          r="0.8"
                          fill="currentColor"
                          stroke="none"
                        />
                        <circle
                          cx="10"
                          cy="15"
                          r="0.8"
                          fill="currentColor"
                          stroke="none"
                        />
                      </svg>
                      {selectedPeriod === "Custom" && startDate && endDate ? (
                        <span className="ride-bill-calendar-range-text">
                          {formatDMMyy(startDate)} – {formatDMMyy(endDate)}
                        </span>
                      ) : null}
                    </button>

                    {showCalendar ? (
                      <div className="ride-bill-calendar-dropdown">
                        <div className="ride-bill-calendar-header">
                          <h4 className="ride-bill-calendar-title">
                            Select date range
                          </h4>
                          <button
                            type="button"
                            className="ride-bill-calendar-close-btn"
                            onClick={() => setShowCalendar(false)}
                            aria-label="Close calendar"
                          >
                            ×
                          </button>
                        </div>
                        <div className="ride-bill-calendar-inputs">
                          <div className="ride-bill-date-input-group">
                            <label htmlFor="analytics-calendar-start">
                              Start date
                            </label>
                            <DatePicker
                              id="analytics-calendar-start"
                              selected={startDate}
                              onChange={(date: Date | null) => {
                                setStartDate(date);
                                if (date && endDate && date > endDate)
                                  setEndDate(date);
                              }}
                              selectsStart
                              startDate={startDate}
                              endDate={endDate}
                              maxDate={endDate || new Date()}
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
                            <label htmlFor="analytics-calendar-end">
                              End date
                            </label>
                            <DatePicker
                              id="analytics-calendar-end"
                              selected={endDate}
                              onChange={(date: Date | null) => {
                                setEndDate(date);
                                if (date && startDate && date < startDate)
                                  setStartDate(date);
                              }}
                              selectsEnd
                              startDate={startDate}
                              endDate={endDate}
                              minDate={startDate || undefined}
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
                        {startDate && endDate ? (
                          <div
                            className={`ride-bill-date-range-info ${startDate > endDate ? "ride-bill-date-range-info--error" : ""}`}
                          >
                            <span className="ride-bill-date-range-text">
                              {startDate > endDate ? (
                                <span className="ride-bill-date-range-error">
                                  Start date must be on or before end date
                                </span>
                              ) : (
                                `${Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1} days selected`
                              )}
                            </span>
                          </div>
                        ) : null}
                        <div className="ride-bill-calendar-actions">
                          <button
                            type="button"
                            className="ride-bill-calendar-cancel-btn"
                            onClick={() => setShowCalendar(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="ride-bill-calendar-apply-btn"
                            disabled={
                              !startDate || !endDate || startDate > endDate
                            }
                            onClick={() => {
                              if (
                                startDate &&
                                endDate &&
                                startDate <= endDate
                              ) {
                                setSelectedPeriod("Custom");
                                setShowCalendar(false);
                              }
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
            </div>

            <div
              className="users-toolbar__right analytics-toolbar-filters-row"
              role="group"
              aria-label="Filter bills"
            >
              <div className="ride-bill-segments ride-bill-toolbar__select-wrap analytics-toolbar__filter">
                <select
                  id="filter-driver"
                  className="ride-bill-toolbar__select"
                  value={pairDriver}
                  onChange={(e) => setPairDriver(e.target.value)}
                  aria-label="Filter by driver"
                >
                  <option value="">All drivers</option>
                  {(pairStudent ? secondaryDriverNames : allDriverNames).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="ride-bill-segments ride-bill-toolbar__select-wrap analytics-toolbar__filter">
                <select
                  id="filter-student"
                  className="ride-bill-toolbar__select"
                  value={pairStudent}
                  onChange={(e) => setPairStudent(e.target.value)}
                  aria-label="Filter by student"
                >
                  <option value="">All students</option>
                  {(pairDriver ? secondaryStudents : allStudents).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ride-bill-segments ride-bill-toolbar__select-wrap ride-bill-toolbar__select-wrap--driver analytics-toolbar__filter analytics-toolbar__filter--route">
                <select
                  id="filter-route"
                  className="ride-bill-toolbar__select"
                  value={pairRoute}
                  onChange={(e) => setPairRoute(e.target.value)}
                  title={pairRoute || undefined}
                  aria-label="Filter by route"
                >
                  <option value="">All routes</option>
                  {secondaryRoutes.map((r) => (
                    <option key={r} value={r} title={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ride-bill-segments ride-bill-toolbar__select-wrap analytics-toolbar__filter">
                <select
                  id="filter-status"
                  className="ride-bill-toolbar__select"
                  value={pairStatus}
                  onChange={(e) => setPairStatus(e.target.value)}
                  aria-label="Filter by payment status"
                >
                  <option value="">All Status</option>
                  <option value="requested">Requested</option>
                  <option value="arrived">Arrived</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {pairActive ? (
            <div className="analytics-filters-summary">
              <span className="pair-scope-note">
                {pairPeriodBillCount} bill{pairPeriodBillCount !== 1 ? "s" : ""}{" "}
                in this period
                {pairFilteredBills.length !== pairPeriodBillCount ? (
                  <span className="pair-scope-sub">
                    {" "}
                    · {pairFilteredBills.length} total matching filters
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="pair-clear-all-btn"
                onClick={() => {
                  setPairDriver("");
                  setPairStudent("");
                  setPairRoute("");
                  setPairStatus("");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>

        <div className="analytics-grid">
          <div className="analytics-card big-card analytics-main-chart-span">
            <div className="card-title-group">
              <h3>{mainChartTitle}</h3>
              <span className="card-subtitle">{periodSubtitle}</span>
            </div>
            {chartScope === "all" ? (
              <div className="chart-container chart-container--combined">
                <div className="chart-combined-row">
                  <div className="chart-combined-label">Ride Payments</div>
                  {paymentsSeries.length === 0 ? (
                    <div className="chart-placeholder chart-placeholder--inline">
                      No payment data for this period
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={paymentsSeries}
                        margin={{ top: 6, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="paymentsGradAll"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#3b82f6"
                              stopOpacity={0.25}
                            />
                            <stop
                              offset="95%"
                              stopColor="#3b82f6"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--card-border)"
                        />
                        <XAxis
                          dataKey={chartCategoryKey}
                          ticks={paymentsTicks}
                          stroke="var(--text-secondary)"
                          style={{ fontSize: "11px" }}
                          tick={{ fill: "var(--text-secondary)" }}
                        />
                        <YAxis
                          stroke="var(--text-secondary)"
                          style={{ fontSize: "11px" }}
                          tick={{ fill: "var(--text-secondary)" }}
                          tickFormatter={(v: number) =>
                            v === 0
                              ? "₹0"
                              : v < 1000
                                ? `₹${v}`
                                : `₹${(v / 1000).toFixed(1)}k`
                          }
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(v: unknown) => {
                            const n = typeof v === "number" ? v : Number(v);
                            return [
                              `₹${n.toLocaleString("en-IN")}`,
                              "Payments",
                            ];
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="payments"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fill="url(#paymentsGradAll)"
                          dot={false}
                          activeDot={{ r: 5, fill: "#3b82f6" }}
                          {...AREA_ANIMATION}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="chart-combined-row">
                  <div className="chart-combined-label">Ride Distribution</div>
                  {rideDistributionData.length === 0 ? (
                    <div className="chart-placeholder chart-placeholder--inline">
                      No ride data for this period
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={rideDistributionData}
                        margin={{ top: 6, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="ridesGradAll"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#3b82f6"
                              stopOpacity={1}
                            />
                            <stop
                              offset="100%"
                              stopColor="#3b82f6"
                              stopOpacity={0.5}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--card-border)"
                        />
                        <XAxis
                          dataKey={chartCategoryKey}
                          ticks={rideTicks}
                          stroke="var(--text-secondary)"
                          style={{ fontSize: "11px" }}
                          tick={{ fill: "var(--text-secondary)" }}
                        />
                        <YAxis
                          stroke="var(--text-secondary)"
                          style={{ fontSize: "11px" }}
                          tick={{ fill: "var(--text-secondary)" }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(v: unknown) => [
                            typeof v === "number" ? v : Number(v),
                            "Ride",
                          ]}
                        />
                        <Bar
                          dataKey="rides"
                          fill="url(#ridesGradAll)"
                          radius={[4, 4, 0, 0]}
                          {...BAR_ANIMATION}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            ) : chartScope === "payment" ? (
              paymentsSeries.length === 0 ? (
                <div className="chart-placeholder">
                  No payment data for this period
                </div>
              ) : (
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={paymentsSeries}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="paymentsGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#3b82f6"
                            stopOpacity={0.25}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3b82f6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--card-border)"
                      />
                      <XAxis
                        dataKey={chartCategoryKey}
                        ticks={paymentsTicks}
                        stroke="var(--text-secondary)"
                        style={{ fontSize: "12px" }}
                        tick={{ fill: "var(--text-secondary)" }}
                      />
                      <YAxis
                        stroke="var(--text-secondary)"
                        style={{ fontSize: "12px" }}
                        tick={{ fill: "var(--text-secondary)" }}
                        tickFormatter={(v: number) => {
                          if (v === 0) return "₹0";
                          if (v < 1000) return `₹${v}`;
                          return `₹${(v / 1000).toFixed(1)}k`;
                        }}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: unknown) => {
                          const n = typeof v === "number" ? v : Number(v);
                          return [`₹${n.toLocaleString("en-IN")}`, "Payments"];
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="payments"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        fill="url(#paymentsGrad)"
                        dot={{ fill: "#3b82f6", r: 3 }}
                        activeDot={{ r: 6, fill: "#3b82f6" }}
                        {...AREA_ANIMATION}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : chartScope === "ride" ? (
              rideDistributionData.length === 0 ? (
                <div className="chart-placeholder">
                  No ride data for this period
                </div>
              ) : (
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={rideDistributionData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="ridesGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#3b82f6"
                            stopOpacity={1}
                          />
                          <stop
                            offset="100%"
                            stopColor="#3b82f6"
                            stopOpacity={0.5}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--card-border)"
                      />
                      <XAxis
                        dataKey={chartCategoryKey}
                        ticks={rideTicks}
                        stroke="var(--text-secondary)"
                        style={{ fontSize: "12px" }}
                        tick={{ fill: "var(--text-secondary)" }}
                      />
                      <YAxis
                        stroke="var(--text-secondary)"
                        style={{ fontSize: "12px" }}
                        tick={{ fill: "var(--text-secondary)" }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: unknown) => {
                          const n = typeof v === "number" ? v : Number(v);
                          return [n, "Rides"];
                        }}
                      />
                      <Bar
                        dataKey="rides"
                        fill="url(#ridesGrad)"
                        radius={[6, 6, 0, 0]}
                        {...BAR_ANIMATION}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : chartScope === "driver" ? (
              driverScopeChartData.length === 0 ? (
                <div className="chart-placeholder">
                  No driver data for this period
                </div>
              ) : (
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={driverScopeChartData}
                      margin={{ top: 8, right: 20, left: 4, bottom: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--card-border)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        stroke="var(--text-secondary)"
                        tick={{ fill: "var(--text-secondary)" }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        stroke="var(--text-secondary)"
                        tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(
                          v: unknown,
                          _name: string | undefined,
                          item: {
                            payload?: { fullName?: string; payments?: number };
                          },
                        ) => {
                          const rides = typeof v === "number" ? v : Number(v);
                          const pay = item.payload?.payments;
                          if (pay != null) {
                            return [
                              `${rides} rides · ₹${pay.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
                              "Totals",
                            ];
                          }
                          return [rides, "Rides"];
                        }}
                        labelFormatter={(_l, p) =>
                          String(
                            (
                              p?.[0]?.payload as
                                | { fullName?: string }
                                | undefined
                            )?.fullName ?? _l,
                          )
                        }
                      />
                      <Bar
                        dataKey="rides"
                        fill="#3b82f6"
                        radius={[0, 4, 4, 0]}
                        {...BAR_ANIMATION}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : chartScope === "student" ? (
              studentScopeChartData.length === 0 ? (
                <div className="chart-placeholder">
                  No student data for this period
                </div>
              ) : (
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={studentScopeChartData}
                      margin={{ top: 8, right: 20, left: 4, bottom: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--card-border)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        stroke="var(--text-secondary)"
                        tick={{ fill: "var(--text-secondary)" }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        stroke="var(--text-secondary)"
                        tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(
                          v: unknown,
                          _name: string | undefined,
                          item: {
                            payload?: { fullName?: string; payments?: number };
                          },
                        ) => {
                          const rides = typeof v === "number" ? v : Number(v);
                          const pay = item.payload?.payments;
                          if (pay != null) {
                            return [
                              `${rides} rides · ₹${pay.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
                              "Totals",
                            ];
                          }
                          return [rides, "Rides"];
                        }}
                        labelFormatter={(_l, p) =>
                          String(
                            (
                              p?.[0]?.payload as
                                | { fullName?: string }
                                | undefined
                            )?.fullName ?? _l,
                          )
                        }
                      />
                      <Bar
                        dataKey="rides"
                        fill="#3b82f6"
                        radius={[0, 4, 4, 0]}
                        {...BAR_ANIMATION}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : routeScopeChartData.length === 0 ? (
              <div className="chart-placeholder">
                No route data for this period
              </div>
            ) : (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={routeScopeChartData}
                    margin={{ top: 8, right: 20, left: 4, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--card-border)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      stroke="var(--text-secondary)"
                      tick={{ fill: "var(--text-secondary)" }}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={118}
                      stroke="var(--text-secondary)"
                      tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: unknown) => {
                        const n = typeof v === "number" ? v : Number(v);
                        return [n, "Rides"];
                      }}
                      labelFormatter={(_l, p) =>
                        String(
                          (p?.[0]?.payload as { fullName?: string } | undefined)
                            ?.fullName ?? _l,
                        )
                      }
                    />
                    <Bar
                      dataKey="rides"
                      fill="#3b82f6"
                      radius={[0, 4, 4, 0]}
                      {...BAR_ANIMATION}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="analytics-card small-card analytics-sidebar--routes">
            <div className="card-title-group">
              <h3>Top Routes</h3>
              <span className="card-subtitle">{periodSubtitle}</span>
            </div>
            <AnalyticsSidebarMiniChart
              rows={routeSidebarChartRows}
              emptyLabel="No route data for this period"
              yAxisWidth={102}
              tooltipStyle={tooltipStyle}
              palette={barPalette}
            />
            <div className="list-placeholder analytics-sidebar-list">
              {topRoutes.length > 0 ? (
                topRoutes.map((item, idx) => (
                  <div className="bar-list-item" key={item.route}>
                    <span
                      className="list-rank"
                      style={{ color: barPalette[idx % barPalette.length] }}
                    >
                      {idx + 1}
                    </span>
                    <div className="bar-list-body">
                      <div className="bar-list-top">
                        <span className="list-name">{item.route}</span>
                        <span className="list-value">{item.rides} rides</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="loc-view-btn"
                      onClick={() => setSelectedRoute(item.route)}
                      title={`View stats for ${item.route}`}
                    >
                      View
                    </button>
                  </div>
                ))
              ) : (
                <div className="list-empty">No route data for this period</div>
              )}
            </div>
          </div>

          <div className="analytics-card small-card analytics-sidebar--drivers">
            <div className="card-title-group">
              <h3>Drivers Analysis</h3>
              <span className="card-subtitle">{periodSubtitle}</span>
            </div>
            <AnalyticsSidebarMiniChart
              rows={driverSidebarChartRows}
              emptyLabel="No driver data for this period"
              yAxisWidth={88}
              tooltipStyle={tooltipStyle}
              palette={barPalette}
            />
            <div className="list-placeholder analytics-sidebar-list">
              {topDrivers.length > 0 ? (
                topDrivers.map((item, idx) => (
                  <div className="bar-list-item" key={item.driver}>
                    <span
                      className="list-rank"
                      style={{ color: barPalette[idx % barPalette.length] }}
                    >
                      {idx + 1}
                    </span>
                    <div className="bar-list-body">
                      <div className="bar-list-top">
                        <span className="list-name">{item.driver}</span>
                        <span className="list-value">{item.rides} rides</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="loc-view-btn"
                      onClick={() => setSelectedDriver(item.driver)}
                      title={`View stats for ${item.driver}`}
                    >
                      View
                    </button>
                  </div>
                ))
              ) : (
                <div className="list-empty">No driver data for this period</div>
              )}
            </div>
          </div>

          <div className="analytics-card small-card analytics-sidebar--students">
            <div className="card-title-group">
              <h3>Students Analysis</h3>
              <span className="card-subtitle">{periodSubtitle}</span>
            </div>
            <AnalyticsSidebarMiniChart
              rows={studentSidebarChartRows}
              emptyLabel="No student data for this period"
              yAxisWidth={88}
              tooltipStyle={tooltipStyle}
              palette={barPalette}
            />
            <div className="list-placeholder analytics-sidebar-list">
              {topStudents.length > 0 ? (
                topStudents.map((item, idx) => (
                  <div className="bar-list-item" key={item.id}>
                    <span
                      className="list-rank"
                      style={{ color: barPalette[idx % barPalette.length] }}
                    >
                      {idx + 1}
                    </span>
                    <div className="bar-list-body">
                      <div className="bar-list-top">
                        <span className="list-name">{item.name}</span>
                        <span className="list-value">{item.rides} rides</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="loc-view-btn"
                      onClick={() => setSelectedStudent(item.id)}
                      title={`View stats for ${item.name}`}
                    >
                      View
                    </button>
                  </div>
                ))
              ) : (
                <div className="list-empty">
                  No student data for this period
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedRoute && routeStats && (
          <div
            className="loc-modal-backdrop"
            onClick={() => setSelectedRoute(null)}
          >
            <div
              className="loc-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="loc-modal-header">
                <div className="loc-modal-title-group">
                  <span className="loc-modal-pin">
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
                  </span>
                  <div>
                    <h4 className="loc-modal-route-title">{selectedRoute}</h4>
                    <span className="loc-modal-sub">{periodSubtitle}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="loc-modal-close"
                  onClick={() => setSelectedRoute(null)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="loc-stat-grid">
                <div className="loc-stat-item">
                  <span className="loc-stat-label">Total Rides</span>
                  <span className="loc-stat-value">
                    {routeStats.totalRides}
                  </span>
                </div>
                <div className="loc-stat-item">
                  <span className="loc-stat-label">Total Payments</span>
                  <span className="loc-stat-value">
                    ₹
                    {routeStats.totalPayments.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
                <div className="loc-stat-item loc-stat-pending">
                  <span className="loc-stat-label">Requested</span>
                  <span className="loc-stat-value">{routeStats.requested}</span>
                </div>
                <div className="loc-stat-item loc-stat-paid">
                  <span className="loc-stat-label">Active</span>
                  <span className="loc-stat-value">{routeStats.active}</span>
                </div>
                <div className="loc-stat-item loc-stat-cancelled">
                  <span className="loc-stat-label">Cancelled</span>
                  <span className="loc-stat-value">{routeStats.cancelled}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedDriver && driverStats && (
          <div
            className="loc-modal-backdrop"
            onClick={() => setSelectedDriver(null)}
          >
            <div
              className="loc-modal loc-modal--wide"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="loc-modal-header">
                <div className="loc-modal-title-group">
                  <span className="loc-modal-pin">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 8c0-2.76 2.24-5 5-5s5 2.24 5 5c0 3.5-5 9-5 9S5 11.5 5 8z" />
                      <circle cx="10" cy="8" r="2" />
                    </svg>
                  </span>
                  <div>
                    <h4>{selectedDriver}</h4>
                    <span className="loc-modal-sub">{periodSubtitle}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="loc-modal-close"
                  onClick={() => setSelectedDriver(null)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="loc-stat-grid">
                <div className="loc-stat-item">
                  <span className="loc-stat-label">Total Rides</span>
                  <span className="loc-stat-value">
                    {driverStats.totalRides}
                  </span>
                </div>
                <div className="loc-stat-item">
                  <span className="loc-stat-label">Payments</span>
                  <span className="loc-stat-value">
                    ₹
                    {driverStats.totalPayments.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
                <div className="loc-stat-item loc-stat-pending">
                  <span className="loc-stat-label">Requested</span>
                  <span className="loc-stat-value">{driverStats.requested}</span>
                </div>
                <div className="loc-stat-item loc-stat-paid">
                  <span className="loc-stat-label">Active</span>
                  <span className="loc-stat-value">{driverStats.active}</span>
                </div>
                <div className="loc-stat-item loc-stat-cancelled">
                  <span className="loc-stat-label">Cancelled</span>
                  <span className="loc-stat-value">
                    {driverStats.cancelled}
                  </span>
                </div>
              </div>

              <div className="driver-modal-grid">
                {driverStats.topRoutes.length > 0 && (
                  <div className="loc-routes-section">
                    <p className="loc-routes-heading">Top routes served</p>
                    {driverStats.topRoutes.map((r) => (
                      <div className="loc-route-row" key={r.route}>
                        <span className="loc-route-arrow">→</span>
                        <span className="loc-route-name">{r.route}</span>
                        <span className="loc-route-count">{r.count} rides</span>
                      </div>
                    ))}
                  </div>
                )}

                {driverStats.topStudents.length > 0 && (
                  <div className="loc-routes-section">
                    <p className="loc-routes-heading">Top students served</p>
                    {driverStats.topStudents.map((s) => (
                      <div className="loc-route-row" key={s.name}>
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="var(--accent-color, #3b82f6)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            width: "14px",
                            height: "14px",
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        >
                          <circle cx="10" cy="7" r="3" />
                          <path d="M4 16c0-2.76 2.69-5 6-5s6 2.24 6 5" />
                        </svg>
                        <span className="loc-route-name">{s.name}</span>
                        <span className="loc-route-count">{s.rides} rides</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedStudent && studentStats && (
          <div
            className="loc-modal-backdrop"
            onClick={() => setSelectedStudent(null)}
          >
            <div
              className="loc-modal loc-modal--wide"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="loc-modal-header">
                <div className="loc-modal-title-group">
                  <span className="loc-modal-pin">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="10" cy="7" r="3.5" />
                      <path d="M3 17c0-3.31 3.13-6 7-6s7 2.69 7 6" />
                    </svg>
                  </span>
                  <div>
                    <h4>{studentStats.studentName}</h4>
                    <span className="loc-modal-sub">{periodSubtitle}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="loc-modal-close"
                  onClick={() => setSelectedStudent(null)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="loc-stat-grid">
                <div className="loc-stat-item">
                  <span className="loc-stat-label">Total Rides</span>
                  <span className="loc-stat-value">
                    {studentStats.totalRides}
                  </span>
                </div>
                <div className="loc-stat-item">
                  <span className="loc-stat-label">Payments</span>
                  <span className="loc-stat-value">
                    ₹
                    {studentStats.totalPayments.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
                <div className="loc-stat-item loc-stat-pending">
                  <span className="loc-stat-label">Requested</span>
                  <span className="loc-stat-value">{studentStats.requested}</span>
                </div>
                <div className="loc-stat-item loc-stat-paid">
                  <span className="loc-stat-label">Active</span>
                  <span className="loc-stat-value">{studentStats.active}</span>
                </div>
                <div className="loc-stat-item loc-stat-cancelled">
                  <span className="loc-stat-label">Cancelled</span>
                  <span className="loc-stat-value">
                    {studentStats.cancelled}
                  </span>
                </div>
              </div>

              <div className="driver-modal-grid">
                {studentStats.topRoutes.length > 0 && (
                  <div className="loc-routes-section">
                    <p className="loc-routes-heading">Top routes</p>
                    {studentStats.topRoutes.map((r) => (
                      <div className="loc-route-row" key={r.route}>
                        <span className="loc-route-arrow">→</span>
                        <span className="loc-route-name">{r.route}</span>
                        <span className="loc-route-count">{r.count} rides</span>
                      </div>
                    ))}
                  </div>
                )}

                {studentStats.topDrivers.length > 0 && (
                  <div className="loc-routes-section">
                    <p className="loc-routes-heading">Top drivers</p>
                    {studentStats.topDrivers.map((d) => (
                      <div className="loc-route-row" key={d.driver}>
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="var(--accent-color, #3b82f6)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            width: "14px",
                            height: "14px",
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        >
                          <path d="M5 8c0-2.76 2.24-5 5-5s5 2.24 5 5c0 3.5-5 9-5 9S5 11.5 5 8z" />
                          <circle cx="10" cy="8" r="2" />
                        </svg>
                        <span className="loc-route-name">{d.driver}</span>
                        <span className="loc-route-count">{d.rides} rides</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </EdgeStateView>
    </div>
  );
};

export default Analytics;
