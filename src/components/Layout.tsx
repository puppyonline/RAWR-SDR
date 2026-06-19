import { Outlet, NavLink, useLocation } from 'react-router-dom';

const navGroups = [
  {
    label: 'Radio',
    color: 'text-radio',
    items: [
      { path: '/fm', label: 'FM Broadcast' },
      { path: '/am', label: 'AM Broadcast' },
      { path: '/hd', label: 'HD Radio' },
    ],
  },
  {
    label: 'Television',
    color: 'text-tv',
    items: [
      { path: '/tv', label: 'Live TV' },
    ],
  },
  {
    label: 'Aviation',
    color: 'text-aviation',
    items: [
      { path: '/atc', label: 'ATC Scanner' },
      { path: '/adsb', label: 'ADS-B Tracker' },
    ],
  },
];

function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col border-r border-bg-border bg-bg-card shrink-0">
        {/* Brand */}
        <div className="px-5 py-5">
          <NavLink to="/" className="block group">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-bright">
                  <path d="M2 12h2M20 12h2M6.34 6.34l1.42 1.42M16.24 16.24l1.42 1.42M6.34 17.66l1.42-1.42M16.24 7.76l1.42-1.42M12 2v2M12 20v2" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-bold text-zinc-100 group-hover:text-brand-bright transition-colors">Airwave</span>
                <p className="text-2xs text-zinc-600">Local Media Hub</p>
              </div>
            </div>
          </NavLink>
        </div>

        {/* Navigation groups */}
        <nav className="flex-1 px-3 pb-4 space-y-5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className={`label px-3 mb-1.5 ${group.color}`}>{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => isActive ? 'nav-item-active' : 'nav-item'}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Device status footer */}
        <div className="px-3 py-3 border-t border-bg-border">
          <div className="card-inner p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xs text-zinc-500">SDR</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-live animate-pulse-live" />
                <span className="text-2xs text-live">Online</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xs text-zinc-500">HDHomeRun</span>
              <span className="text-2xs text-zinc-400">Flex 4K</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 flex items-center justify-between px-5 border-b border-bg-border bg-bg-card/60 backdrop-blur-sm shrink-0">
          <span className="text-sm text-zinc-400">
            {navGroups.flatMap(g => g.items).find(i => i.path === location.pathname)?.label
              || (location.pathname === '/' ? 'Home' : '')}
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-live" />
              <span className="text-2xs text-zinc-500">Mesa, AZ</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
