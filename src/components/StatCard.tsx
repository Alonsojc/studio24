import Link from 'next/link';

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
  color?: 'green' | 'red' | 'default';
  href?: string;
}

const valueColors = {
  green: 'text-green-600',
  red: 'text-red-600',
};

export default function StatCard({ label, value, subtitle, accent, color, href }: StatCardProps) {
  const valueColor = color && color !== 'default' ? valueColors[color] : null;
  const className = `block rounded-2xl p-4 sm:p-6 transition-all ${
    href
      ? 'hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c72a09]/40'
      : ''
  } ${accent && !valueColor ? 'bg-[#c72a09] text-white' : 'bg-white border border-neutral-100'}`;

  const content = (
    <>
      <p
        className={`text-[10px] font-semibold tracking-[0.12em] uppercase ${
          accent && !valueColor ? 'text-white/60' : 'text-neutral-400'
        }`}
      >
        {label}
      </p>
      <p
        className={`text-2xl sm:text-[28px] font-black tracking-[-0.03em] mt-2 ${
          valueColor || (accent ? 'text-white' : 'text-[#0a0a0a]')
        }`}
      >
        {value}
      </p>
      {subtitle && (
        <p className={`text-xs mt-1 font-medium ${accent && !valueColor ? 'text-white/50' : 'text-neutral-400'}`}>
          {subtitle}
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={`Ir a ${label}`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
