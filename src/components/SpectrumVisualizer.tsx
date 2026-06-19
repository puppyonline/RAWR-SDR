import { useEffect, useRef } from 'react';

interface SpectrumVisualizerProps {
  isActive: boolean;
}

function SpectrumVisualizer({ isActive }: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const dataRef = useRef<number[]>(new Array(64).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Update data with smooth random values
      dataRef.current = dataRef.current.map((val) => {
        if (!isActive) return val * 0.95;
        const target = Math.random() * 0.8 + 0.1;
        return val + (target - val) * 0.15;
      });

      const barWidth = width / dataRef.current.length;
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
      gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.7)');
      gradient.addColorStop(1, 'rgba(34, 211, 238, 0.9)');

      dataRef.current.forEach((val, i) => {
        const barHeight = val * height;
        const x = i * barWidth;
        ctx.fillStyle = gradient;
        ctx.fillRect(x + 1, height - barHeight, barWidth - 2, barHeight);
      });

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={512}
      height={160}
      className="w-full h-40 rounded-lg bg-black/20"
    />
  );
}

export default SpectrumVisualizer;
