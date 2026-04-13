interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-10">
      <div>
        <h1 className="text-[32px] font-black tracking-[-0.04em] text-[#0a0a0a] uppercase">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-neutral-400 mt-1 font-medium">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
