import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, qs, type Paged, type RecordSummary } from '../../api/client';
import { Pagination } from '../../components/Pagination';
import { defaultPeriod, PeriodPicker, periodRange, type Period } from '../../components/PeriodPicker';
import { RecordCard } from '../../components/RecordCard';
import { TopBar } from '../../components/ui';
import { displayName } from '../../lib/format';
import { useAdminOptions } from './useAdminOptions';

const PAGE_SIZE = 10;

/** 전체 기록: 기간·사용자(작성/참여)·도구 필터, 최신순 10개씩 */
export default function AdminRecords() {
  const [params] = useSearchParams();
  const { users, tools } = useAdminOptions();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod(params.get('userId') || params.get('toolId') ? 'all' : '30'));
  const [userId, setUserId] = useState(params.get('userId') ?? '');
  const [toolId, setToolId] = useState(params.get('toolId') ?? '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<RecordSummary> | null>(null);
  const [error, setError] = useState('');

  const range = periodRange(period);
  const query = qs({ ...range, userId: userId || undefined, toolId: toolId || undefined, page, pageSize: PAGE_SIZE });

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    api<Paged<RecordSummary>>(`/admin/records${query}`)
      .then((r) => !cancelled && setData(r))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : '불러오지 못했어요.'));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div className="app">
      <TopBar title="전체 기록" />
      <section className="card">
        <PeriodPicker value={period} onChange={change(setPeriod)} />
        <div className="filter-row">
          <select className="select" value={userId} onChange={(e) => change(setUserId)(e.target.value)} aria-label="사용자">
            <option value="">모든 사용자</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)}
              </option>
            ))}
          </select>
          <select className="select" value={toolId} onChange={(e) => change(setToolId)(e.target.value)} aria-label="도구">
            <option value="">모든 도구</option>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isActive ? '' : ' (비활성)'}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && <div className="empty">{error}</div>}
      {!data && !error && <div className="empty">불러오는 중…</div>}
      {data && (
        <>
          <p className="row-desc" style={{ margin: '16px 4px 0' }}>
            총 {data.total}건{userId && ' · 작성하거나 동료로 참여한 기록'}
          </p>
          {data.items.length === 0 && (
            <section className="card">
              <div className="empty">조건에 맞는 기록이 없어요</div>
            </section>
          )}
          {data.items.map((r) => (
            <RecordCard key={r.id} record={r} perspective="admin" />
          ))}
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={(p) => {
            setPage(p);
            window.scrollTo(0, 0);
          }} />
        </>
      )}
    </div>
  );
}
