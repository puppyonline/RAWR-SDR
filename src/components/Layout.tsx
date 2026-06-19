import { Outlet, NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: DashboardIcon },
  { path: '/fm', label: 'FM Radio', icon: FMIcon },
  { path: '/am', label: 'AM Radio', icon: AMIcon },
  { path: '/atc', label: 'ATC', icon: ATCIcon },
  { path: '/hd', label: 'HD Radio', icon: HDIcon },
  { path: '/adsb', label: 'ADS-B', icon: ADSBIcon },
];

function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-white/[0.06] bg-surface-1">
        {/* Logo */}
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-bright">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">RAWR-SDR</h1>
              <p className="text-[10px] text-white/30 uppercase tracking-widest">Software Radio</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          <p className="label px-3 mb-2">Receivers</p>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                isActive ? 'sidebar-link-active' : 'sidebar-link'
              }
            >
              <item.icon active={location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Device Status */}
        <div className="p-4 border-t border-white/[0.06]">
          <div className="card-inner p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40">Device</span>
              <span className="badge-success text-[10px]">Connected</span>
            </div>
            <p className="text-sm font-medium text-white/80">RTL2832U R820T2</p>
            <p className="text-[11px] text-white/30 mt-0.5">USB 2.0 &middot; 2.4 MSPS</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-white/[0.06] bg-surface-1/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">
              {navItems.find(n => n.path === location.pathname || (n.path !== '/' && location.pathname.startsWith(n.path)))?.label || 'Dashboard'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-white/40">Live</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Icon Components
function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={active ? 'text-accent-bright' : 'text-white/40'}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function FMIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={active ? 'text-accent-bright' : 'text-white/40'}>
      <path d="M2 12h2l3-9 4 18 4-18 3 9h4" />
    </svg>
  );
}

function AMIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={active ? 'text-accent-bright' : 'text-white/40'}>
      <path d="M2 12c0 0 3-8 10-8s10 8 10 8" />
      <path d="M5 12c0 0 2-5 7-5s7 5 7 5" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function ATCIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={active ? 'text-accent-bright' : 'text-white/40'}>
      <path d="M12 2L4 7v4c0 5.5 3.4 10.7 8 12 4.6-1.3 8-6.5 8-12V7l-8-5z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function HDIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={active ? 'text-accent-bright' : 'text-white/40'}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M7 10v4M7 12h4M11 10v4M15 10h2a2 2 0 010 4h-2v-4z" />
    </svg>
  );
}

function ADSBIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={active ? 'text-accent-bright' : 'text-white/40'}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

export default Layout;
