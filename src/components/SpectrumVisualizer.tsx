import { useEffect, useRef } from 'react';

interface SpectrumVisualizerProps {
  getFrequencyData?: () => Uint8Array;
  isActive: boolean;
  color?: string;
  height?: number;
}

function SpectrumVisualizer({ getFrequencyData, isActive, color = '#3b82f6', height = 90 }: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      let data: Uint8Array;
      if (isActive && getFrequencyData) {
        data = getFrequencyData();
      } else {
        data = new Uint8Array(128);
      }

      const barCount = data.length;
      const barWidth = w / barCount;

      for (let i = 0; i < barCount; i++) {
        const val = data[i] / 255;
        const barH = val * h * 0.85;
        const x = i * barWidth;

        ctx.fillStyle = `${color}${Math.round(val * 180 + 20).toString(16).padStart(2, '0')}`;
        ctx.fillRect(x + 0.5, h - barH, barWidth - 1, barH);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [isActive, color, getFrequencyData]);

  return (
    <canvas
      ref={canvasRef}
      style={{ height: `${height}px` }}
      className="w-full rounded-lg bg-bg-raised"
    />
  );
}

export default SpectrumVisualizer;
