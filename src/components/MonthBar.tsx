'use client';

import { formatCurrency } from '@/lib/helpers';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface MonthBarProps {
  /** Items with fecha (YYYY-MM-DD) and montoTotal */
  items: { fecha: string; montoTotal: number }[];
  year: number;
  selectedMonth: string; // 'all' | 'YYYY-MM'
  onSelect: (month: string) => void;
  color?: 'green' | 'red';
}

export default function MonthBar({ items, year, selectedMonth, onSelect, color = 'green' }: MonthBarProps) {
  const yearStr = String(year);
  const itemsYear = items.filter((i) => i.fecha.startsWith(yearStr + '-'));

  const monthData = MESES.map((label, idx) => {
    const monthStr = String(idx + 1).padStart(2, '0');
    const key = `${yearStr}-${monthStr}`;
    const monthItems = itemsYear.filter((i) => i.fecha.substring(5, 7) === monthStr);
    const total = monthItems.reduce((s, i) => s + i.montoTotal, 0);
    return { label, key, total, count: monthItems.length };
  });

  const totalYear = itemsYear.reduce((s, i) => s + i.montoTotal, 0);
  const isAll = selectedMonth === 'all';
  const activeColor =
    color === 'green' ? 'text-green-600 border-green-500 bg-green-50' : 'text-red-600 border-red-500 bg-red-50';
  const activeValueColor = color === 'green' ? 'text-green-600' : 'text-red-600';

  return (
    <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-thin">
      <button
        onClick={() => onSelect('all')}
        className={`p-3 rounded-xl text-center border transition-all shrink-0 min-w-[5.5rem] ${
          isAll ? activeColor : 'border-neutral-200 hover:border-neutral-400'
        }`}
      >
        <p
          className={`text-[10px] font-bold tracking-[0.05em] uppercase ${isAll ? activeValueColor : 'text-neutral-400'}`}
        >
          Todo
        </p>
        <p className={`text-sm font-black mt-1 ${isAll ? activeValueColor : 'text-[#0a0a0a]'}`}>
          {formatCurrency(totalYear)}
        </p>
        <p className="text-[9px] text-neutral-400 mt-0.5">{itemsYear.length} reg.</p>
      </button>
      {monthData.map((b) => {
        const isActive = selectedMonth === b.key;
        return (
          <button
            key={b.key}
            onClick={() => onSelect(isActive ? 'all' : b.key)}
            className={`p-3 rounded-xl text-center border transition-all shrink-0 min-w-[5.5rem] ${
              isActive ? activeColor : 'border-neutral-200 hover:border-neutral-400'
            }`}
          >
            <p
              className={`text-[10px] font-bold tracking-[0.05em] uppercase ${isActive ? activeValueColor : 'text-neutral-400'}`}
            >
              {b.label}
            </p>
            <p className={`text-sm font-black mt-1 ${isActive ? activeValueColor : 'text-[#0a0a0a]'}`}>
              {formatCurrency(b.total)}
            </p>
            <p className="text-[9px] text-neutral-400 mt-0.5">{b.count} reg.</p>
          </button>
        );
      })}
    </div>
  );
}
