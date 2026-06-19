import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light' | 'oled';

const themes: { id: Theme; label: string; icon: string }[] = [
  { id: 'dark', label: 'Dark', icon: '🌙' },
  { id: 'light', label: 'Light', icon: '☀️' },
  { id: 'oled', label: 'OLED', icon: '⚫' },
];

function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('airwave-theme') as Theme) || 'dark';
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('airwave-theme', theme);
  }, [theme]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md hover:bg-bg-hover text-zinc-400 hover:text-zinc-200 transition-colors"
        title="Theme"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-bg-card border border-bg-border rounded-lg shadow-xl p-1 min-w-[120px]">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors ${
                  theme === t.id ? 'bg-brand/10 text-brand-bright' : 'text-zinc-400 hover:text-zinc-200 hover:bg-bg-hover'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ThemePicker;
