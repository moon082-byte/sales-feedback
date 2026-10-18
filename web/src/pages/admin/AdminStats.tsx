import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, qs, type Analytics } from '../../api/client';
import { BarList, DayColumns } from '../../components/Charts';
import { defaultPeriod, PeriodPicker, periodRange, type Period } from '../../components/PeriodPicker';
import { Segmented, TopBar } from '../../components/ui';
import { displayName } from '../../lib/format';
import { useAdminOptions } from './useAdminOptions';

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '-');

/** byDay 의 빈 날짜를 0으로 채운다 (최대 120일) */
function fillDays(byDay: Analytics['byDay'], from?: number, to?: number): Analytics['byDay'] {
  if (!byDay.length && from === undefined) return [];
  const map = new Map(byDay.map((d) => [d.date, d]));
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const start = from !== undefined ? new Date(from) : parse(byDay[0].date);
  const end = to !== undefined ? new Date(to - 1) : parse(byDay[byDay.length - 1].date);
  const out: Analytics['byDay'] = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end && out.length < 120; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(map.get(key) ?? { date: key, records: 0, phoneExchanged: 0 });
  }
  return out.length >= 120 ? byDay : out;
}

export default function AdminStats() {
  const { users, tools } = useAdminOptions();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('30'));
  const [userId, setUserId] = useState('');
  const [toolId, setToolId] = useState('');
  const [qCat, setQCat] = useState<'Q1' | 'Q2'>('Q1');
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');

  const range = periodRange(period);
  const query = qs({ ...range, userId: userId || undefined, toolId: toolId || undefined });

  useEffect(() => {
    let cancelled = false;
    setError('');
    api<Analytics>(`/admin/stats${query}`)
      .then((r) => !cancelled && setData(r))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : '불러오지 못했어요.'));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const days = useMemo(() => (data ? fillDays(data.byDay, range.from, range.to) : []), [data, range.from, range.to]);
  const t = data?.totals;

  return (
    <div className="app">
      <TopBar title="분석" />
      <section className="card">
        <PeriodPicker value={period} onChange={setPeriod} />
        <div className="filter-row">
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="사용자">
            <option value="">모든 사용자</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)}
              </option>
            ))}
          </select>
          <select className="select" value={toolId} onChange={(e) => setToolId(e.target.value)} aria-label="도구">
            <option value="">모든 도구</option>
            {tools.map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && <div className="empty">{error}</div>}
      {!data && !error && <div className="empty">불러오는 중…</div>}
      {data && t && (
        <>
          <section className="card">
            <div className="stats three">
              <div className="stat">
                <div className="stat-label">영업 기록</div>
                <div className="stat-value">
                  {t.records}
                  <small>건</small>
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">번호교환</div>
                <div className="stat-value">
                  {t.phoneExchanged}
                  <small>건</small>
                </div>
                <div className="stat-foot">교환률 {pct(t.phoneExchanged, t.records)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">작성자</div>
                <div className="stat-value">
                  {t.authors}
                  <small>명</small>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">일별 영업 기록</h2>
            <DayColumns days={days} />
          </section>

          <section className="card">
            <h2 className="card-title">사용자별</h2>
            {data.byUser.length === 0 ? (
              <div className="empty">데이터가 없어요</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">사용자</th>
                      <th scope="col">작성</th>
                      <th scope="col">참여</th>
                      <th scope="col">번호교환</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byUser.map((row) => (
                      <tr key={row.user.id}>
                        <th scope="row">
                          <Link to={`/admin/records?userId=${row.user.id}`}>{displayName(row.user)}</Link>
                        </th>
                        <td>{row.written}</td>
                        <td>{row.participated}</td>
                        <td>
                          {row.phoneExchanged}
                          <span className="muted"> ({pct(row.phoneExchanged, row.written)})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="row-desc" style={{ marginTop: 10 }}>
                  작성 = 직접 기록, 참여 = 동료로 태그됨, 번호교환은 작성 기록 기준
                </p>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">도구별</h2>
            <BarList
              rows={data.byTool.map((row) => ({
                key: row.tool?.id ?? 'none',
                label: row.tool ? <Link to={`/admin/records?toolId=${row.tool.id}`}>{row.tool.name}</Link> : '도구 없음',
                value: row.records,
                sub: `교환률 ${pct(row.phoneExchanged, row.records)}`,
              }))}
            />
          </section>

          <section className="card">
            <h2 className="card-title">자주 체크된 평가 항목</h2>
            <Segmented
              value={qCat}
              onChange={setQCat}
              options={[
                { value: 'Q1', label: '파악 못한 부분' },
                { value: 'Q2', label: '멘트 · 비언어' },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <BarList
                rows={data.byQuestion
                  .filter((q) => q.category === qCat)
                  .slice(0, 10)
                  .map((q) => ({ key: q.questionId, label: q.text, value: q.count, sub: pct(q.count, t.records) }))}
                emptyText="체크된 항목이 없어요"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
