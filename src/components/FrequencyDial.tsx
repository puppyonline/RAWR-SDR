interface FrequencyDialProps {
  value: number;
  onChange: (freq: number) => void;
  min: number;
  max: number;
  step: number;
  color?: string;
}

function FrequencyDial({ value, onChange, min, max, step, color = '#6366f1' }: FrequencyDialProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="relative h-2 bg-surface-2 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-75"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}40, ${color})` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {/* Thumb indicator */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 bg-surface-0 shadow-lg pointer-events-none transition-all duration-75"
          style={{ left: `calc(${pct}% - 8px)`, borderColor: color }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-white/25">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default FrequencyDial;
