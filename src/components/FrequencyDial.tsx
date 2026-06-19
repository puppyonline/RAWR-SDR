interface FrequencyDialProps {
  value: number;
  onChange: (freq: number) => void;
  min: number;
  max: number;
  step: number;
}

function FrequencyDial({ value, onChange, min, max, step }: FrequencyDialProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer
                     bg-gradient-to-r from-purple-900/50 to-cyan-900/50
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                     [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-gradient-to-br
                     [&::-webkit-slider-thumb]:from-purple-400
                     [&::-webkit-slider-thumb]:to-cyan-400
                     [&::-webkit-slider-thumb]:shadow-lg
                     [&::-webkit-slider-thumb]:shadow-purple-500/50"
        />
        <div
          className="absolute top-0 left-0 h-2 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 pointer-events-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-white/40">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default FrequencyDial;
