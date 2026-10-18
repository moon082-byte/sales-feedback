import { useEffect, useState } from 'react';
import { api, ApiError, type PublicUser } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { TopBar, useConfirm, useToast } from '../../components/ui';
import { displayName } from '../../lib/format';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [q, setQ] = useState('');
  const [toast, showToast] = useToast();
  const [sheet, confirm] = useConfirm();

  useEffect(() => {
    api<{ users: PublicUser[] }>('/admin/users')
      .then((r) => setUsers(r.users))
      .catch((err) => showToast(err instanceof ApiError ? err.message : '불러오지 못했어요.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRole = async (u: PublicUser, role: 'user' | 'admin') => {
    const ok = await confirm({
      title: role === 'admin' ? `${displayName(u)}님을 관리자로 지정할까요?` : `${displayName(u)}님의 관리자 권한을 해제할까요?`,
      message: role === 'admin' ? '모든 기록 열람·수정과 문항·도구 관리가 가능해져요.' : undefined,
      confirmText: role === 'admin' ? '지정' : '해제',
      danger: role === 'user',
    });
    if (!ok) return;
    try {
      const r = await api<{ user: PublicUser }>(`/admin/users/${u.id}`, { method: 'PATCH', body: { role } });
      setUsers((list) => list?.map((x) => (x.id === u.id ? r.user : x)) ?? null);
      showToast(role === 'admin' ? '관리자로 지정했어요' : '관리자 권한을 해제했어요');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '변경하지 못했어요.');
    }
  };

  const filtered = users?.filter((u) => !q.trim() || displayName(u).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="app">
      <TopBar title="사용자 권한" />
      <input className="input small" placeholder="닉네임 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="닉네임 검색" />
      {!users && <div className="empty">불러오는 중…</div>}
      {filtered && (
        <section className="card" style={{ paddingTop: 8, paddingBottom: 8 }}>
          {filtered.length === 0 && <div className="empty">사용자가 없어요</div>}
          {filtered.map((u) => (
            <div key={u.id} className="row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span className="avatar">{u.nickname?.[0] ?? '?'}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="row-label">
                    {u.nickname}
                    <span className="profile-tag">#{u.tag}</span>
                    {u.id === me?.id && <span className="row-desc"> (나)</span>}
                  </div>
                  <div className="row-desc">{u.role === 'admin' ? '관리자' : '일반'}</div>
                </div>
              </div>
              <button
                className={`btn ${u.role === 'admin' ? 'ghost' : 'secondary'} pill-btn`}
                onClick={() => setRole(u, u.role === 'admin' ? 'user' : 'admin')}
              >
                {u.role === 'admin' ? '해제' : '관리자 지정'}
              </button>
            </div>
          ))}
        </section>
      )}
      {sheet}
      {toast}
    </div>
  );
}
