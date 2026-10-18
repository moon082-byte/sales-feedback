import { useEffect, useState } from 'react';
import { api, type PublicUser } from '../api/client';
import { displayName } from '../lib/format';

/** 동료 검색 + 복수 선택 */
export function UserPicker({ value, onChange }: { value: PublicUser[]; onChange: (users: PublicUser[]) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api<{ users: PublicUser[] }>(`/users?q=${encodeURIComponent(query)}`);
        if (!cancelled) setResults(res.users);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const selectedIds = new Set(value.map((u) => u.id));
  const toggle = (u: PublicUser) =>
    onChange(selectedIds.has(u.id) ? value.filter((v) => v.id !== u.id) : [...value, u]);

  return (
    <div>
      {value.length > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {value.map((u) => (
            <button key={u.id} type="button" className="chip selected" onClick={() => toggle(u)} aria-label={`${displayName(u)} 선택 해제`}>
              {displayName(u)} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <input
        className="input small"
        placeholder="닉네임으로 검색 (예: 홍길동#12)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="동료 검색"
      />
      {q.trim() && (
        <div className="search-results">
          {loading && results.length === 0 && <div className="row-desc" style={{ padding: '12px 4px' }}>검색 중…</div>}
          {!loading && results.length === 0 && <div className="row-desc" style={{ padding: '12px 4px' }}>검색 결과가 없어요</div>}
          {results.map((u) => (
            <button key={u.id} type="button" className="search-item" onClick={() => toggle(u)} aria-pressed={selectedIds.has(u.id)}>
              <span className="avatar">{u.nickname?.[0] ?? '?'}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {u.nickname}
                <span className="profile-tag">#{u.tag}</span>
              </span>
              <span className={`check-circle${selectedIds.has(u.id) ? ' on' : ''}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
