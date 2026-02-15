import { useEffect, useRef } from 'react';

interface WaveformVisualizerProps {
  isPlaying: boolean;
  barCount?: number;
}

const WaveformVisualizer = ({ isPlaying, barCount = 24 }: WaveformVisualizerProps) => {
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!barsRef.current) return;
    const bars = barsRef.current.children;
    Array.from(bars).forEach((bar, i) => {
      const el = bar as HTMLElement;
      if (isPlaying) {
        const delay = (i * 0.05) % 0.8;
        const duration = 0.3 + Math.random() * 0.4;
        el.style.animation = `waveBar ${duration}s ${delay}s ease-in-out infinite`;
      } else {
        el.style.animation = 'none';
        el.style.height = '20%';
      }
    });
  }, [isPlaying]);

  return (
    <div ref={barsRef} className="flex items-end gap-[2px] h-12 w-full px-2">
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-full bg-gradient-to-t from-primary to-accent"
          style={{ height: '20%', minWidth: 2, transition: 'height 0.1s' }}
        />
      ))}
    </div>
  );
};

export default WaveformVisualizer;
