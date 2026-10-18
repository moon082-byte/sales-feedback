import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const BOT = import.meta.env.VITE_BOT_USERNAME as string | undefined;

export default function Login() {
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      await login(code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했어요.');
      setBusy(false);
    }
  };

  // 로컬 개발 전용: 텔레그램 없이 코드 발급
  const devIssue = async () => {
    try {
      const { code } = await api<{ code: string }>('/dev/login-code', { method: 'POST', body: { telegramId: '10001' } });
      setCode(code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '발급 실패');
    }
  };

  return (
    <form className="app" onSubmit={submit}>
      <h1 className="h1" style={{ marginTop: 72 }}>
        텔레그램 인증코드를
        <br />
        입력해 주세요
      </h1>
      <p className="desc">
        {BOT ? (
          <>
            <a href={`https://t.me/${BOT}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
              @{BOT}
            </a>
          </>
        ) : (
          '텔레그램 봇'
        )}
        에게 <b>/login</b> 을 보내면 6자리 코드를 받을 수 있어요.
      </p>

      <input
        className="input code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-label="인증코드"
        autoFocus
      />
      <div className="error-text" role="alert">
        {error}
      </div>

      <div className="bottom-cta">
        <button className="btn" type="submit" disabled={code.length !== 6 || busy}>
          {busy ? '확인 중…' : '로그인'}
        </button>
        {import.meta.env.DEV && (
          <button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={devIssue}>
            개발용 코드 발급
          </button>
        )}
      </div>
    </form>
  );
}
