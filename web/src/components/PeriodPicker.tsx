import { toDateKey } from './Calendar';
import { Segmented } from './ui';

export type PeriodPreset = '7' | '30' | '90' | 'all' | 'custom';

export interface Period {
  preset: PeriodPreset;
  /** custom 일 때 YYYY-MM-DD (포함) */
  start: string;
  end: string;
}

export function defaultPeriod(preset: PeriodPreset = '30'): Period {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  return { preset, start: toDateKey(start), end: toDateKey(today) };
}

const startOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** API 쿼리용 [from, to) */
export function periodRange(p: Period): { from?: number; to?: number } {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
  if (p.preset === 'all') return {};
  if (p.preset === 'custom') {
    const s = startOf(p.start);
    const e = startOf(p.end);
    return { from: s.getTime(), to: new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1).getTime() };
  }
  const days = Number(p.preset);
  return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)).getTime(), to: tomorrow };
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div>
      <Segmented
        value={value.preset}
        onChange={(preset) => onChange({ ...value, preset })}
        options={[
          { value: '7', label: '7일' },
          { value: '30', label: '30일' },
          { value: '90', label: '90일' },
          { value: 'all', label: '전체' },
          { value: 'custom', label: '직접' },
        ]}
      />
      {value.preset === 'custom' && (
        <div className="date-range">
          <input
            type="date"
            className="input small"
            value={value.start}
            max={value.end}
            onChange={(e) => e.target.value && onChange({ ...value, start: e.target.value })}
            aria-label="시작일"
          />
          <span className="muted">~</span>
          <input
            type="date"
            className="input small"
            value={value.end}
            min={value.start}
            onChange={(e) => e.target.value && onChange({ ...value, end: e.target.value })}
            aria-label="종료일"
          />
        </div>
      )}
    </div>
  );
}
