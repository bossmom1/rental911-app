import type { ReactNode } from 'react';

type Tone = 'navy' | 'gold' | 'red' | 'lightBlue';

// Solid, bold, colorful stat cards — NOT gray/neutral.
const tones: Record<Tone, string> = {
  navy: 'bg-navy text-white',
  gold: 'bg-gold text-navy',
  red: 'bg-red-600 text-white',
  lightBlue: 'bg-light-blue text-navy',
};

export function StatCard({
  label,
  value,
  tone = 'navy',
  sublabel,
  icon,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  sublabel?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={`rounded-xl p-6 shadow-md ${tones[tone]}`}>
      <div className="flex items-start justify-between">
        <p className="font-display text-base font-bold uppercase tracking-wide opacity-90">
          {label}
        </p>
        {icon && <span className="opacity-90">{icon}</span>}
      </div>
      <p className="mt-3 font-display text-4xl font-bold leading-none">{value}</p>
      {sublabel && <p className="mt-2 text-base opacity-90">{sublabel}</p>}
    </div>
  );
}
