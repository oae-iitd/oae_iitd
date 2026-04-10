import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import OAEIcon from '../../assets/oae_icon.png';
import LocationIcon from '../../assets/icons/location.svg';
import UserIcon from '../../assets/icons/adduser.svg';
import HomeIcon from '../../assets/icons/home.svg';
import BillIcon from '../../assets/icons/bill.svg';
import AnalyticsIcon from '../../assets/icons/data.svg';
import RegistrationReviewsIcon from '../../assets/images/fill-up.png';
import '../layout/AdminLayout.css';

interface NavItem {
  path: string;
  label: string;
  /** Emoji or resolved asset URL from import */
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/admin/dashboard', label: 'Dashboard Overview', icon: HomeIcon },
  { path: '/admin/users', label: 'User Management', icon: UserIcon },
  { path: '/admin/registrations', label: 'Registration Reviews', icon: RegistrationReviewsIcon },
  { path: '/admin/ride-location', label: 'Ride Location', icon: LocationIcon },
  { path: '/admin/ride-bill', label: 'Ride Bill', icon: BillIcon },
  { path: '/admin/analytics', label: 'Analytics', icon: AnalyticsIcon },
  { path: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

function readSidebarOpen(): boolean {
  const saved = localStorage.getItem('sidebarOpen');
  return saved !== null ? saved === 'true' : true;
}

/** True when the icon should render as <img src> (URLs, data: SVGs from bundlers, etc.). */
function isIconAssetUrl(icon: string): boolean {
  return (
    icon.startsWith('data:') ||
    icon.startsWith('blob:') ||
    icon.startsWith('/') ||
    icon.startsWith('http') ||
    icon.includes('.svg') ||
    /\.(png|jpe?g|gif|webp)(\?|$)/i.test(icon)
  );
}

interface SidebarProps {
  onSidebarStateChange?: (isOpen: boolean) => void;
}

const Sidebar = ({ onSidebarStateChange }: SidebarProps) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    onSidebarStateChange?.(sidebarOpen);
    // Intentionally once on mount so parent margin matches initial persisted width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleToggleEvent = () => {
      const currentState = localStorage.getItem('sidebarOpen');
      const newState = currentState === 'true' ? 'false' : 'true';
      localStorage.setItem('sidebarOpen', newState);
      const isOpen = newState === 'true';
      setSidebarOpen(isOpen);
      onSidebarStateChange?.(isOpen);
    };

    window.addEventListener('toggleSidebar', handleToggleEvent);
    return () => window.removeEventListener('toggleSidebar', handleToggleEvent);
  }, [onSidebarStateChange]);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('sidebarOpen', String(next));
      onSidebarStateChange?.(next);
      return next;
    });
  };

  return (
    <aside
      className={`admin-sidebar ${sidebarOpen || isHovering ? 'open' : 'closed'} ${isHovering ? 'hovering' : ''}`}
      onMouseEnter={() => {
        if (!sidebarOpen) setIsHovering(true);
      }}
      onMouseLeave={() => {
        setIsHovering(false);
        if (localStorage.getItem('sidebarOpen') === 'false') {
          setSidebarOpen(false);
        }
      }}
    >
      <div className="sidebar-header">
        <img src={OAEIcon} alt="OAE Icon" className="sidebar-logo" />
        {sidebarOpen && (
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={toggleSidebar}
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            ◀
          </button>
        )}
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            title={!sidebarOpen ? item.label : ''}
          >
            <span className="nav-icon">
              {isIconAssetUrl(item.icon) ? (
                <img src={item.icon} alt="" className="nav-icon-svg" />
              ) : (
                item.icon
              )}
            </span>
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
