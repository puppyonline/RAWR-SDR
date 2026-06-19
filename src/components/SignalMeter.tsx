import { useEffect, useState, useRef } from 'react';

interface SignalMeterProps {
  getSignalLevel?: () => number;
  isActive?: boolean;
  color?: string;
}

function SignalMeter({ getSignalLevel, isActive = false, color = '#3b82f6' }: SignalMeterProps) {
  const [value, setValue] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive && getSignalLevel) {
      intervalRef.current = setInterval(() => setValue(getSignalLevel()), 100);
    } else {
      setValue(0);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActive, getSignalLevel]);

  const segments = 16;
  const active = Math.round((value / 100) * segments);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-[2px] h-8">
        {Array.from({ length: segments }).map((_, i) => {
          const isOn = i < active;
          const intensity = i / segments;
          let segColor = color;
          if (intensity > 0.7) segColor = '#22c55e';
          else if (intensity > 0.4) segColor = '#f59e0b';
          else segColor = '#ef4444';

          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all duration-100"
              style={{
                height: `${30 + (i / segments) * 70}%`,
                backgroundColor: isOn ? segColor : 'rgba(255,255,255,0.03)',
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-2xs font-mono text-zinc-600">S0</span>
        <span className="text-xs font-mono text-zinc-400">{value}%</span>
        <span className="text-2xs font-mono text-zinc-600">S9+</span>
      </div>
    </div>
  );
}

export default SignalMeter;
