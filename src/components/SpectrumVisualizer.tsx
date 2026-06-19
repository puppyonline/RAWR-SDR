import { useEffect, useRef } from 'react';

interface SpectrumVisualizerProps {
  isActive: boolean;
  color?: string;
  height?: number;
}

function SpectrumVisualizer({ isActive, color = '#6366f1', height = 120 }: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const dataRef = useRef<number[]>(new Array(128).fill(0));
  const targetRef = useRef<number[]>(new Array(128).fill(0));

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

      // Generate targets
      if (isActive) {
        for (let i = 0; i < targetRef.current.length; i++) {
          // Create a natural-looking spectrum with peaks
          const base = Math.sin(i * 0.05) * 0.15 + 0.2;
          const noise = (Math.random() - 0.5) * 0.3;
          targetRef.current[i] = Math.max(0.02, Math.min(0.95, base + noise + 0.3));
        }
      } else {
        targetRef.current = targetRef.current.map(() => 0.01);
      }

      // Smooth towards targets
      dataRef.current = dataRef.current.map((val, i) => {
        const target = targetRef.current[i];
        return val + (target - val) * (isActive ? 0.12 : 0.05);
      });

      const barCount = dataRef.current.length;
      const barWidth = w / barCount;
      const gap = 1;

      // Draw bars
      for (let i = 0; i < barCount; i++) {
        const barH = dataRef.current[i] * h * 0.85;
        const x = i * barWidth;
        const y = h - barH;

        // Gradient per bar
        const gradient = ctx.createLinearGradient(x, h, x, y);
        gradient.addColorStop(0, `${color}15`);
        gradient.addColorStop(0.4, `${color}60`);
        gradient.addColorStop(1, `${color}cc`);

        ctx.fillStyle = gradient;
        ctx.fillRect(x + gap / 2, y, barWidth - gap, barH);
      }

      // Draw top line
      ctx.beginPath();
      ctx.strokeStyle = `${color}80`;
      ctx.lineWidth = 1;
      for (let i = 0; i < barCount; i++) {
        const barH = dataRef.current[i] * h * 0.85;
        const x = i * barWidth + barWidth / 2;
        const y = h - barH;
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
  }, [isActive, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ height: `${height}px` }}
      className="w-full rounded-lg bg-surface-2"
    />
  );
}

export default SpectrumVisualizer;
