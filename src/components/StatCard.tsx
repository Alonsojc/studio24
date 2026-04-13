interface StatCardProps {
  label: string;
  value: string;
  icon: string;
  trend?: string;
  color: 'purple' | 'green' | 'red' | 'blue' | 'pink' | 'yellow';
}

const colorMap = {
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  pink: 'bg-pink-50 text-pink-700 border-pink-200',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200',
};

const iconBgMap = {
  purple: 'bg-purple-100',
  green: 'bg-emerald-100',
  red: 'bg-red-100',
  blue: 'bg-blue-100',
  pink: 'bg-pink-100',
  yellow: 'bg-amber-100',
};

export default function StatCard({ label, value, icon, trend, color }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium opacity-70 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {trend && (
            <p className="text-xs mt-1 opacity-60">{trend}</p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-lg ${iconBgMap[color]} flex items-center justify-center text-2xl`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
