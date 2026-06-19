import { useEffect, useState, useRef } from 'react';

interface SignalMeterProps {
  /** Function that returns current signal level 0-100 */
  getSignalLevel?: () => number;
  isActive?: boolean;
  color?: string;
}

function SignalMeter({ getSignalLevel, isActive = false, color = '#6366f1' }: SignalMeterProps) {
  const [value, setValue] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive && getSignalLevel) {
      intervalRef.current = setInterval(() => {
        setValue(getSignalLevel());
      }, 100); // update 10x/sec
    } else {
      setValue(0);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActive, getSignalLevel]);

  const segments = 20;
  const active = Math.round((value / 100) * segments);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-[2px] h-10">
        {Array.from({ length: segments }).map((_, i) => {
          const isOn = i < active;
          const intensity = i / segments;
          let segColor = color;
          if (intensity > 0.7) segColor = '#10b981';
          else if (intensity > 0.4) segColor = '#f59e0b';
          else segColor = '#ef4444';

          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all duration-100"
              style={{
                height: `${30 + (i / segments) * 70}%`,
                backgroundColor: isOn ? segColor : 'rgba(255,255,255,0.04)',
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-mono text-white/25">S0</span>
        <span className="text-xs font-mono text-white/60">{value}%</span>
        <span className="text-[10px] font-mono text-white/25">S9+</span>
      </div>
    </div>
  );
}

export default SignalMeter;
