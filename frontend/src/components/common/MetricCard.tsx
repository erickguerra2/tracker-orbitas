interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  accent?: 'green' | 'sky' | 'amber' | 'red' | 'slate';
  sub?: string;
}

const accentClass: Record<string, string> = {
  green: 'text-emerald-400',
  sky: 'text-sky-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  slate: 'text-slate-300',
};

export function MetricCard({ label, value, unit, accent = 'green', sub }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5">
      <span className="label">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono text-xl font-medium leading-none tracking-tight ${accentClass[accent]}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
      {sub && <span className="text-[10px] text-slate-600">{sub}</span>}
    </div>
  );
}
