import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs, type Paged, type RecordSummary } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Calendar, toDateKey } from '../components/Calendar';
import { BellIcon, GearIcon } from '../components/Icons';
import { RecordCard } from '../components/RecordCard';
import { dayRange } from '../lib/format';

export default function Main() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toDateKey(new Date()));
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [dayRecords, setDayRecords] = useState<RecordSummary[] | null>(null);
  const [summary, setSummary] = useState<{ sales: number; phoneExchanged: number } | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api<{ sales: number; phoneExchanged: number }>('/stats/summary').then(setSummary).catch(() => {});
    api<{ count: number }>('/notifications/unread-count')
      .then((r) => setUnread(r.count))
      .catch(() => {});
  }, []);

  // 캘린더에 표시되는 6주 범위의 받은 평가 날짜
  useEffect(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const from = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay()).getTime();
    const to = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + 42).getTime();
    let cancelled = false;
    api<{ timestamps: number[] }>(`/records/timestamps${qs({ scope: 'received', from, to })}`)
      .then((r) => !cancelled && setMarks(new Set(r.timestamps.map((t) => toDateKey(new Date(t))))))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    const { from, to } = dayRange(selected);
    let cancelled = false;
    setDayRecords(null);
    api<Paged<RecordSummary>>(`/records${qs({ scope: 'received', from, to, pageSize: 50 })}`)
      .then((r) => !cancelled && setDayRecords(r.items))
      .catch(() => !cancelled && setDayRecords([]));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const [, m, d] = selected.split('-').map(Number);

  return (
    <div className="app has-fab">
      <header className="topbar">
        <button className="profile-chip" onClick={() => navigate('/settings')} aria-label="내 프로필">
          <span className="avatar">{user?.nickname?.[0] ?? '?'}</span>
          <span className="profile-name">
            {user?.nickname}
            <span className="profile-tag">#{user?.tag}</span>
          </span>
        </button>
        <div className="topbar-side right">
          <Link className="icon-btn" to="/inbox" aria-label={unread ? `알림함, 새 알림 ${unread}개` : '알림함'}>
            <BellIcon />
            {unread > 0 && <span className="badge-dot" />}
          </Link>
          <Link className="icon-btn" to="/settings" aria-label="설정">
            <GearIcon />
          </Link>
        </div>
      </header>

      <section className="card">
        <Calendar month={month} selected={selected} marks={marks} onMonthChange={setMonth} onSelect={setSelected} />
      </section>

      <section className="card">
        <h2 className="card-title">
          {m}월 {d}일 받은 평가
        </h2>
        {dayRecords === null && <div className="empty">불러오는 중…</div>}
        {dayRecords?.length === 0 && <div className="empty">이 날 받은 평가가 없어요</div>}
        {dayRecords && dayRecords.length > 0 && (
          <div className="flat-list">
            {dayRecords.map((r) => (
              <RecordCard key={r.id} record={r} perspective="received" />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">최근 7일 요약</h2>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">영업</div>
            <div className="stat-value">
              {summary?.sales ?? '-'}
              <small>건</small>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">번호교환</div>
            <div className="stat-value">
              {summary?.phoneExchanged ?? '-'}
              <small>건</small>
            </div>
          </div>
        </div>
        <button className="link-btn" onClick={() => navigate('/records')}>
          모든 평가 보기
        </button>
      </section>

      <div className="fab-wrap">
        <Link to="/records/new" className="btn fab">
          + 영업 기록 작성
        </Link>
      </div>
    </div>
  );
}
