import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type PublicUser } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { TopBar } from '../components/ui';

const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]{2,12}$/;

/** 첫 접속 시 닉네임 생성, 설정에서 닉네임 변경 시에도 재사용 */
export default function Nickname({ edit = false }: { edit?: boolean }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(edit ? (user?.nickname ?? '') : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = NICKNAME_RE.test(nickname.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<{ user: PublicUser }>('/me', { method: 'PATCH', body: { nickname: nickname.trim() } });
      setUser(res.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '저장하지 못했어요.');
      setBusy(false);
    }
  };

  return (
    <form className="app" onSubmit={submit}>
      {edit ? <TopBar title="닉네임 변경" /> : <div style={{ height: 48 }} />}
      <h1 className="h1">{edit ? '새 닉네임을 입력해 주세요' : '동료들에게 보일\n닉네임을 정해 주세요'}</h1>
      <p className="desc">
        닉네임 뒤에 <b>#1234</b> 같은 고유태그가 자동으로 붙어서 이름이 같아도 구분돼요.
      </p>
      <input
        className="input"
        placeholder="닉네임 (2~12자)"
        value={nickname}
        maxLength={12}
        onChange={(e) => setNickname(e.target.value)}
        aria-label="닉네임"
        autoFocus
      />
      <div className="error-text" role="alert">
        {error || (nickname && !valid ? '한글, 영문, 숫자, _ 로 2~12자 입력해 주세요.' : '')}
      </div>
      <div className="bottom-cta">
        <button className="btn" type="submit" disabled={!valid || busy}>
          {busy ? '저장 중…' : edit ? '변경하기' : '시작하기'}
        </button>
      </div>
    </form>
  );
}
