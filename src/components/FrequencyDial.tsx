interface FrequencyDialProps {
  value: number;
  onChange: (freq: number) => void;
  min: number;
  max: number;
  step: number;
  color?: string;
}

function FrequencyDial({ value, onChange, min, max, step, color = '#3b82f6' }: FrequencyDialProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-1.5">
      <div className="relative h-1.5 bg-raised rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-75"
          style={{ width: `${pct}%`, background: color }}
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
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 bg-bg shadow-md pointer-events-none transition-all duration-75"
          style={{ left: `calc(${pct}% - 6px)`, borderColor: color }}
        />
      </div>
      <div className="flex justify-between text-2xs font-mono text-faint">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default FrequencyDial;
