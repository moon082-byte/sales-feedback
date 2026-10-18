import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, qs, type NotificationItem, type Paged } from '../api/client';
import { TopBar } from '../components/ui';
import { displayName, formatRelative } from '../lib/format';

const PAGE_SIZE = 20;

function message(n: NotificationItem): string {
  const who = n.actor ? displayName(n.actor) : '동료';
  if (n.type === 'record_tagged') return `${who}님이 함께한 영업 평가를 남겼어요`;
  return '새 알림이 있어요';
}

/** 알림함: 열면 모두 읽음 처리 (이번 화면에서는 새 알림을 강조 표시) */
export default function Inbox() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api<Paged<NotificationItem>>(`/notifications${qs({ page, pageSize: PAGE_SIZE })}`)
      .then((res) => {
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        if (page === 1 && res.items.some((n) => !n.readAt)) {
          void api('/notifications/read', { method: 'POST', body: {} }).catch(() => {});
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : '불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="app">
      <TopBar title="알림함" />
      {error && <div className="empty">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <section className="card">
          <div className="empty">아직 받은 알림이 없어요</div>
        </section>
      )}
      {items.length > 0 && (
        <section className="card" style={{ padding: '8px 8px' }}>
          {items.map((n) => {
            const body = (
              <>
                <span className={`unread-dot${n.readAt ? ' read' : ''}`} aria-hidden="true" />
                <span style={{ flex: 1 }}>
                  <span className="row-label" style={{ display: 'block' }}>
                    {message(n)}
                  </span>
                  <span className="row-desc">{formatRelative(n.createdAt)}</span>
                </span>
              </>
            );
            return n.recordId ? (
              <Link key={n.id} to={`/records/${n.recordId}`} className="notice-item">
                {body}
              </Link>
            ) : (
              <div key={n.id} className="notice-item">
                {body}
              </div>
            );
          })}
        </section>
      )}
      {items.length < total && (
        <button className="link-btn" disabled={loading} onClick={() => setPage((p) => p + 1)}>
          {loading ? '불러오는 중…' : '더 보기'}
        </button>
      )}
    </div>
  );
}
