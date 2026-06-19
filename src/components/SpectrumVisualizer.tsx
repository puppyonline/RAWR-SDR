import { useEffect, useRef } from 'react';

interface SpectrumVisualizerProps {
  /** Function that returns current FFT data (Uint8Array of 128 bins, 0-255) */
  getFrequencyData?: () => Uint8Array;
  isActive: boolean;
  color?: string;
  height?: number;
}

function SpectrumVisualizer({ getFrequencyData, isActive, color = '#6366f1', height = 100 }: SpectrumVisualizerProps) {
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
        data = new Uint8Array(128); // silence
      }

      const barCount = data.length;
      const barWidth = w / barCount;

      // Draw bars
      const gradient = ctx.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, `${color}10`);
      gradient.addColorStop(0.3, `${color}40`);
      gradient.addColorStop(0.7, `${color}90`);
      gradient.addColorStop(1, `${color}dd`);

      for (let i = 0; i < barCount; i++) {
        const normalized = data[i] / 255;
        const barH = normalized * h * 0.9;
        const x = i * barWidth;
        ctx.fillStyle = gradient;
        ctx.fillRect(x + 0.5, h - barH, barWidth - 1, barH);
      }

      // Peak line
      ctx.beginPath();
      ctx.strokeStyle = `${color}60`;
      ctx.lineWidth = 1;
      for (let i = 0; i < barCount; i++) {
        const normalized = data[i] / 255;
        const y = h - normalized * h * 0.9;
        const x = i * barWidth + barWidth / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

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
      className="w-full rounded-lg bg-surface-2"
    />
  );
}

export default SpectrumVisualizer;
