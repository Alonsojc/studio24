interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end justify-between mb-10">
      <div className="min-w-0">
        <h1 className="text-[28px] sm:text-[32px] font-black tracking-normal text-[#0a0a0a] uppercase break-words">
          {title}
        </h1>
        {description && <p className="text-sm text-neutral-400 mt-1 font-medium">{description}</p>}
      </div>
      {action && <div className="max-w-full [&>div]:flex-wrap">{action}</div>}
    </div>
  );
}
