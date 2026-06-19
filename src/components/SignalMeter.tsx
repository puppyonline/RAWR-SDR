interface SignalMeterProps {
  value: number; // 0-100
}

function SignalMeter({ value }: SignalMeterProps) {
  const bars = 10;
  const activeBars = Math.round((value / 100) * bars);

  const getBarColor = (index: number) => {
    if (index >= activeBars) return 'bg-white/10';
    if (index < bars * 0.3) return 'bg-red-400';
    if (index < bars * 0.6) return 'bg-yellow-400';
    return 'bg-green-400';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-16 justify-center">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={`w-3 rounded-sm transition-all duration-300 ${getBarColor(i)}`}
            style={{ height: `${((i + 1) / bars) * 100}%` }}
          />
        ))}
      </div>
      <div className="text-center text-sm text-white/60">{value}%</div>
    </div>
  );
}

export default SignalMeter;
