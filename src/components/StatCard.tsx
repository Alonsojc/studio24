interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
}

export default function StatCard({ label, value, subtitle, accent }: StatCardProps) {
  return (
    <div className={`rounded-2xl p-6 transition-all ${
      accent
        ? 'bg-[#c72a09] text-white'
        : 'bg-white border border-neutral-100'
    }`}>
      <p className={`text-[10px] font-semibold tracking-[0.12em] uppercase ${
        accent ? 'text-white/60' : 'text-neutral-400'
      }`}>
        {label}
      </p>
      <p className={`text-[28px] font-black tracking-[-0.03em] mt-2 ${
        accent ? 'text-white' : 'text-[#0a0a0a]'
      }`}>
        {value}
      </p>
      {subtitle && (
        <p className={`text-xs mt-1 font-medium ${
          accent ? 'text-white/50' : 'text-neutral-400'
        }`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
