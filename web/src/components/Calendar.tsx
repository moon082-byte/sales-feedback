import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from './Icons';

/** 로컬 시간 기준 YYYY-MM-DD */
export function toDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function Calendar({
  month,
  selected,
  marks,
  onMonthChange,
  onSelect,
}: {
  /** 표시할 달의 아무 날짜 */
  month: Date;
  selected: string;
  /** 점을 찍을 날짜 키 */
  marks: Set<string>;
  onMonthChange: (d: Date) => void;
  onSelect: (key: string) => void;
}) {
  const todayKey = toDateKey(new Date());
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const shift = (n: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div>
      <div className="cal-head">
        <button className="icon-btn" aria-label="이전 달" onClick={() => shift(-1)}>
          <ChevronLeft />
        </button>
        <div className="cal-month">
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </div>
        <button className="icon-btn" aria-label="다음 달" onClick={() => shift(1)}>
          <ChevronRight />
        </button>
      </div>
      <div className="cal-grid">
        {DOW.map((d, i) => (
          <div key={d} className={`cal-dow${i === 0 ? ' sun' : ''}`}>
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = toDateKey(d);
          const cls = [
            'cal-day',
            d.getMonth() !== month.getMonth() && 'out',
            d.getDay() === 0 && 'sun',
            key === todayKey && 'today',
            key === selected && 'selected',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button key={key} className={cls} onClick={() => onSelect(key)} aria-label={key} aria-pressed={key === selected}>
              {d.getDate()}
              {marks.has(key) && <span className="dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
