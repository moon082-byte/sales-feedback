import { ChevronLeft, ChevronRight } from './Icons';

/** 현재 페이지 주변 최대 5개 번호를 표시 */
export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);

  return (
    <nav className="pagination" aria-label="페이지">
      <button className="icon-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="이전 페이지">
        <ChevronLeft />
      </button>
      {nums.map((n) => (
        <button key={n} className={`page-num${n === page ? ' current' : ''}`} onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined}>
          {n}
        </button>
      ))}
      <button className="icon-btn" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="다음 페이지">
        <ChevronRight />
      </button>
    </nav>
  );
}
