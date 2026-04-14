interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
  color?: 'green' | 'red' | 'default';
}

const colorMap = {
  green: { bg: 'bg-green-600', label: 'text-green-200', value: 'text-white', subtitle: 'text-green-200/60' },
  red: { bg: 'bg-red-600', label: 'text-red-200', value: 'text-white', subtitle: 'text-red-200/60' },
};

export default function StatCard({ label, value, subtitle, accent, color }: StatCardProps) {
  const c = color && color !== 'default' ? colorMap[color] : null;

  return (
    <div
      className={`rounded-2xl p-6 transition-all ${
        c ? `${c.bg} text-white` : accent ? 'bg-[#c72a09] text-white' : 'bg-white border border-neutral-100'
      }`}
    >
      <p
        className={`text-[10px] font-semibold tracking-[0.12em] uppercase ${
          c ? c.label : accent ? 'text-white/60' : 'text-neutral-400'
        }`}
      >
        {label}
      </p>
      <p
        className={`text-[28px] font-black tracking-[-0.03em] mt-2 ${
          c ? c.value : accent ? 'text-white' : 'text-[#0a0a0a]'
        }`}
      >
        {value}
      </p>
      {subtitle && (
        <p className={`text-xs mt-1 font-medium ${c ? c.subtitle : accent ? 'text-white/50' : 'text-neutral-400'}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
