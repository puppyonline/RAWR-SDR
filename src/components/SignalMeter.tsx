interface SignalMeterProps {
  value: number; // 0-100
  color?: string;
}

function SignalMeter({ value, color = '#6366f1' }: SignalMeterProps) {
  const segments = 20;
  const active = Math.round((value / 100) * segments);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-[2px] h-10">
        {Array.from({ length: segments }).map((_, i) => {
          const isActive = i < active;
          const intensity = i / segments;
          let segColor = color;
          if (intensity > 0.7) segColor = '#10b981';
          else if (intensity > 0.4) segColor = '#f59e0b';
          else segColor = '#ef4444';

          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all duration-200"
              style={{
                height: `${30 + (i / segments) * 70}%`,
                backgroundColor: isActive ? segColor : 'rgba(255,255,255,0.04)',
                opacity: isActive ? 0.9 : 1,
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
