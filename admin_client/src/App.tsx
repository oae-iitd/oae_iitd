import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AuthProvider from "./hooks/auth/AuthProvider";
import { useAuth } from "./hooks/auth/useAuth";
import { ThemeProvider } from "./hooks/ui/useTheme";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { ToastProvider } from "./components/common/ToastProvider";
import AdminLayout from "./components/layout/AdminLayout";
import ProtectedRoute from "./routes/ProtectedRoute";
import Home from "./pages/public/Home/Home";
import Login from "./pages/public/Login/Login";
import Dashboard from "./pages/admin/Dashboard/Dashboard";
import Users from "./pages/admin/Users/Users";
import RideLocation from "./pages/admin/RideLocation/RideLocation";
import RideBill from "./pages/admin/RideBill/RideBill";
import Analytics from "./pages/admin/Analytics/Analytics";
import Settings from "./pages/admin/Settings/Settings";
import Registrations from "./pages/admin/Registrations/Registrations";
import httpClient from "./services/api/http";
import { API_ENDPOINTS } from "./services/api/endpoints";
import { applyAccentColorVars } from "./utils/accentColors";

/**
 * After cache clear, `user_appearance` is empty — sync accent from API when logged in,
 * otherwise apply default so `--accent-*` are always set.
 */
function AccentSync() {
  const { user } = useAuth();

  useEffect(() => {
    const applyFromStorage = (): boolean => {
      try {
        const raw = localStorage.getItem("user_appearance");
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { accentColor?: string };
        applyAccentColorVars(parsed.accentColor || "blue");
        return true;
      } catch {
        return false;
      }
    };

    if (applyFromStorage()) {
      return;
    }

    if (!user?.id) {
      applyAccentColorVars("blue");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await httpClient.get(API_ENDPOINTS.PREFERENCES);
        if (cancelled) return;
        const accent =
          response.data?.preferences?.accentColor || "blue";
        applyAccentColorVars(accent);
        localStorage.setItem(
          "user_appearance",
          JSON.stringify({ accentColor: accent })
        );
      } catch {
        if (!cancelled) applyAccentColorVars("blue");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <AccentSync />
            <Router>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="users" element={<Users />} />
                  <Route path="ride-location" element={<RideLocation />} />
                  <Route path="ride-bill" element={<RideBill />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="registrations" element={<Registrations />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Navigate to="/admin/dashboard" replace />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Router>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
