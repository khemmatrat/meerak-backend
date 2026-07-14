'use client';

type Props = {
  levels: number[];
  active: boolean;
  bars?: number;
};

export function JarvisVoiceWave({ levels, active, bars = 16 }: Props) {
  const count = levels.length > 0 ? levels.length : bars;

  return (
    <div className={`jarvis-wave${active ? ' active' : ''}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const h = active && levels[i] != null
          ? Math.max(18, Math.round(levels[i] * 100))
          : 22 + Math.sin((i / count) * Math.PI * 2) * 8;
        return (
          <span
            key={i}
            className="jarvis-wave-bar"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}
