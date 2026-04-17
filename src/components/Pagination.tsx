'use client';

const PAGE_SIZE = 50;

interface PaginationProps {
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}

export default function Pagination({ total, page, onPageChange, pageSize = PAGE_SIZE }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex items-center justify-between mt-4 px-2">
      <span className="text-xs text-neutral-400">
        {start}–{end} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          aria-label="Página anterior"
          className="w-11 h-11 rounded-lg border border-neutral-200 flex items-center justify-center text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        {Array.from({ length: totalPages }, (_, i) => {
          // Show first, last, current, and neighbors; ellipsis for gaps
          if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) {
            return (
              <button
                key={i}
                onClick={() => onPageChange(i)}
                className={`hidden sm:inline-flex w-11 h-11 rounded-lg text-xs font-bold items-center justify-center transition-colors ${
                  i === page
                    ? 'bg-[#0a0a0a] text-white'
                    : 'border border-neutral-200 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600'
                }`}
              >
                {i + 1}
              </button>
            );
          }
          // Show ellipsis only once per gap
          if (i === 1 && page > 2) {
            return (
              <span key="start-dots" className="text-xs text-neutral-300 px-1">
                ...
              </span>
            );
          }
          if (i === totalPages - 2 && page < totalPages - 3) {
            return (
              <span key="end-dots" className="text-xs text-neutral-300 px-1">
                ...
              </span>
            );
          }
          return null;
        })}
        <span className="sm:hidden text-xs font-bold text-neutral-500 px-2">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          aria-label="Página siguiente"
          className="w-11 h-11 rounded-lg border border-neutral-200 flex items-center justify-center text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export { PAGE_SIZE };
