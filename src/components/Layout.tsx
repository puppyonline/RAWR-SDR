import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import ThemePicker from './ThemePicker';

const navLinks = [
  { path: '/', label: 'Home' },
  { path: '/fm', label: 'FM' },
  { path: '/hd', label: 'HD Radio' },
  { path: '/tv', label: 'Live TV' },
  { path: '/guide', label: 'TV Guide' },
  { path: '/atc', label: 'ATC' },
  { path: '/weather', label: 'Weather' },
  { path: '/adsb', label: 'ADS-B' },
];

function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top navigation bar */}
      <header className="h-14 shrink-0 border-b border-edge bg-card flex items-center px-4 gap-4 z-50">
        {/* Brand */}
        <NavLink to="/" className="flex items-center gap-2 shrink-0 mr-2">
          <div className="w-7 h-7 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-bright">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
            </svg>
          </div>
          <span className="text-sm font-bold text-primary hidden sm:block">Airwave</span>
        </NavLink>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {navLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.path === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-brand/10 text-brand-bright border border-brand/20'
                    : 'text-muted hover:text-secondary hover:bg-hover'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-live animate-pulse-live" />
            <span className="text-2xs text-muted">Mesa, AZ</span>
          </div>
          <ThemePicker />
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-1.5 rounded-md hover:bg-hover text-muted"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <aside
            className="absolute top-14 left-0 w-64 h-[calc(100%-3.5rem)] bg-card border-r border-edge p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="space-y-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  end={link.path === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand/10 text-brand-bright border border-brand/20'
                        : 'text-muted hover:text-secondary hover:bg-hover'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-5">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
