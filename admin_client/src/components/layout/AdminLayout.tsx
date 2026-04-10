import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/auth/useAuth';
import { useTheme } from '../../hooks/ui/useTheme';
import Sidebar from '../admin/Sidebar';
import './AdminLayout.css';

const PAGE_TITLES: { path: string; label: string }[] = [
  { path: '/admin/dashboard', label: 'Dashboard Overview' },
  { path: '/admin/users', label: 'User Management' },
  { path: '/admin/registrations', label: 'Registration Reviews' },
  { path: '/admin/ride-location', label: 'Ride Location' },
  { path: '/admin/ride-bill', label: 'Ride Bill' },
  { path: '/admin/analytics', label: 'Analytics' },
  { path: '/admin/settings', label: 'Settings' },
];

function readSidebarOpen(): boolean {
  const saved = localStorage.getItem('sidebarOpen');
  return saved !== null ? saved === 'true' : true;
}

const AdminLayout = () => {
  const { logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);

  const pageTitle =
    PAGE_TITLES.find(
      (item) =>
        location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    )?.label ?? 'Admin';

  const toggleSidebar = () => {
    window.dispatchEvent(new CustomEvent('toggleSidebar'));
  };

  return (
    <div className="admin-layout">
      <Sidebar onSidebarStateChange={setSidebarOpen} />

      <main className={`admin-main ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <header className="admin-header">
          <div className="header-content">
            <div className="header-left">
              <button
                type="button"
                className="mobile-sidebar-toggle"
                onClick={toggleSidebar}
                aria-label="Toggle sidebar"
              >
                ☰
              </button>
              <h1 className="page-title">{pageTitle}</h1>
            </div>
            <div className="header-actions">
              <button
                type="button"
                onClick={toggleTheme}
                className="theme-toggle-btn"
                aria-label="Toggle theme"
                title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {resolvedTheme === 'dark' ? '☀️' : '🌙'}
              </button>
              <button type="button" onClick={logout} className="logout-btn">
                Logout
              </button>
            </div>
          </div>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
