import { useState } from 'react';

/** 단일 계열 가로 막대 목록: 라벨 · 막대 · 값(직접 표기) */
export function BarList({
  rows,
  emptyText = '데이터가 없어요',
}: {
  rows: { key: string | number; label: React.ReactNode; value: number; sub?: string }[];
  emptyText?: string;
}) {
  if (!rows.length) return <div className="empty">{emptyText}</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="bar-list">
      {rows.map((r) => (
        <li key={r.key} className="bar-row">
          <div className="bar-row-head">
            <span className="bar-label">{r.label}</span>
            <span className="bar-value">
              {r.value.toLocaleString()}
              {r.sub && <span className="bar-sub"> · {r.sub}</span>}
            </span>
          </div>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 일별 세로 막대 + 호버/탭 툴팁. days 는 빈 날짜까지 채운 연속 구간 */
export function DayColumns({ days }: { days: { date: string; records: number; phoneExchanged: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (!days.length) return <div className="empty">데이터가 없어요</div>;
  const max = Math.max(...days.map((d) => d.records), 1);
  const label = (date: string) => {
    const [, m, d] = date.split('-').map(Number);
    return `${m}/${d}`;
  };
  const tip = active !== null ? days[active] : null;
  // 라벨이 겹치지 않도록 최대 7개 정도만 표시
  const step = Math.ceil(days.length / 7);

  return (
    <div className="day-chart" onMouseLeave={() => setActive(null)}>
      <div className="day-tip" aria-live="polite">
        {tip ? (
          <>
            <b>{label(tip.date)}</b> 영업 {tip.records}건 · 번호교환 {tip.phoneExchanged}건
          </>
        ) : (
          <span className="muted">막대를 눌러 날짜별 수치를 확인하세요 · 최대 {max}건</span>
        )}
      </div>
      <div className="day-cols" role="list">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            role="listitem"
            className={`day-col${active === i ? ' active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-label={`${label(d.date)} 영업 ${d.records}건, 번호교환 ${d.phoneExchanged}건`}
          >
            <span className="day-bar" style={{ height: `${(d.records / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="day-axis" aria-hidden="true">
        {days.map((d, i) => (
          <span key={d.date}>{i % step === 0 ? label(d.date) : ''}</span>
        ))}
      </div>
    </div>
  );
}
