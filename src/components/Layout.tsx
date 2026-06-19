import { Outlet, NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📡' },
  { path: '/fm', label: 'FM Radio', icon: '📻' },
  { path: '/am', label: 'AM Radio', icon: '🔊' },
  { path: '/atc', label: 'ATC', icon: '✈️' },
  { path: '/hd', label: 'HD Radio', icon: '🎵' },
  { path: '/adsb', label: 'ADS-B', icon: '🛫' },
];

function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass-panel m-4 mb-0 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-cyan-400 flex items-center justify-center text-lg">
            📡
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-200 to-cyan-200 bg-clip-text text-transparent">
              RAWR-SDR
            </h1>
            <p className="text-xs text-white/50">Software Defined Radio</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                isActive ? 'nav-link-active' : 'nav-link'
              }
            >
              <span className="mr-1.5">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white/60">SDR Connected</span>
        </div>
      </header>

      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
