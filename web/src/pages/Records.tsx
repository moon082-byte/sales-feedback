import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, qs, type Paged, type RecordSummary } from '../api/client';
import { Pagination } from '../components/Pagination';
import { RecordCard } from '../components/RecordCard';
import { Segmented, TopBar } from '../components/ui';

type Scope = 'received' | 'written';
const PAGE_SIZE = 10;

/** 모든 평가 보기: 최신순 10개씩 */
export default function Records() {
  const [params, setParams] = useSearchParams();
  const scope: Scope = params.get('scope') === 'written' ? 'written' : 'received';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [data, setData] = useState<Paged<RecordSummary> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api<Paged<RecordSummary>>(`/records${qs({ scope, page, pageSize: PAGE_SIZE })}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : '불러오지 못했어요.'));
  }, [scope, page]);

  const go = (next: { scope?: Scope; page?: number }) => {
    setData(null);
    setParams({ scope: next.scope ?? scope, page: String(next.page ?? 1) }, { replace: true });
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <TopBar title="모든 평가" />
      <Segmented
        value={scope}
        onChange={(s) => go({ scope: s })}
        options={[
          { value: 'received', label: '받은 평가' },
          { value: 'written', label: '내가 쓴 기록' },
        ]}
      />
      {error && <div className="empty">{error}</div>}
      {!data && !error && <div className="empty">불러오는 중…</div>}
      {data && data.items.length === 0 && (
        <section className="card">
          <div className="empty">{scope === 'received' ? '아직 받은 평가가 없어요' : '아직 작성한 기록이 없어요'}</div>
        </section>
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="row-desc" style={{ margin: '16px 4px 0' }}>
            총 {data.total}건
          </p>
          {data.items.map((r) => (
            <RecordCard key={r.id} record={r} perspective={scope} />
          ))}
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={(p) => go({ page: p })} />
        </>
      )}
    </div>
  );
}
