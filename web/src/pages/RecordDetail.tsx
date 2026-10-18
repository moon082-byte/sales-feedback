import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type RecordDetail as Detail } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { TopBar, useConfirm, useToast } from '../components/ui';
import { displayName, formatDateTime } from '../lib/format';

export default function RecordDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const [record, setRecord] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();
  const [sheet, confirm] = useConfirm();
  const navigate = useNavigate();

  useEffect(() => {
    if ((location.state as { saved?: boolean } | null)?.saved) showToast('저장했어요');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api<{ record: Detail }>(`/records/${id}`)
      .then((r) => setRecord(r.record))
      .catch((err) => setError(err instanceof ApiError ? err.message : '불러오지 못했어요.'));
  }, [id]);

  const canEdit = record && user && (record.author.id === user.id || user.role === 'admin');
  const isAdmin = user?.role === 'admin';

  const remove = async () => {
    const ok = await confirm({
      title: '이 기록을 삭제할까요?',
      message: '삭제한 기록과 관련 알림은 되돌릴 수 없어요.',
      confirmText: '삭제',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/records/${id}`, { method: 'DELETE' });
      navigate(-1);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '삭제하지 못했어요.');
    }
  };

  return (
    <div className="app">
      <TopBar
        title="평가 상세"
        right={
          canEdit ? (
            <Link to={`/records/${id}/edit`} className="text-btn">
              수정
            </Link>
          ) : null
        }
      />
      {error && (
        <section className="card">
          <div className="empty">{error}</div>
        </section>
      )}
      {!record && !error && <div className="empty">불러오는 중…</div>}
      {record && (
        <>
          <section className="card">
            <div className="row-desc">{formatDateTime(record.createdAt)}</div>
            <h1 className="h2">{displayName(record.author)}님의 영업 기록</h1>
            <dl className="kv">
              <dt>함께한 동료</dt>
              <dd>{record.peers.length ? record.peers.map(displayName).join(', ') : '없음'}</dd>
              <dt>도구</dt>
              <dd>{record.tool?.name ?? '-'}</dd>
              <dt>번호교환</dt>
              <dd>{record.phoneExchanged ? '했어요' : '못 했어요'}</dd>
            </dl>
          </section>

          <section className="card">
            <h2 className="card-title">파악한 고객정보</h2>
            <p className="pre">{record.customerInfo || <span className="muted">작성된 내용이 없어요</span>}</p>
          </section>

          {(['Q1', 'Q2'] as const).map((cat) => {
            const answers = record.answers.filter((a) => a.category === cat);
            return (
              <section className="card" key={cat}>
                <h2 className="card-title">{cat === 'Q1' ? 'Q1. 파악하지 못한 부분' : 'Q2. 영업멘트 · 비언어적 요소'}</h2>
                {answers.length === 0 && <div className="row-desc">체크한 항목이 없어요</div>}
                {answers.map((a) => (
                  <div key={a.questionId} className="answer">
                    <div className="answer-q">{a.questionText}</div>
                    {a.reason && <div className="answer-r pre">{a.reason}</div>}
                  </div>
                ))}
              </section>
            );
          })}
          {record.updatedAt !== record.createdAt && (
            <p className="row-desc" style={{ textAlign: 'center', marginTop: 16 }}>
              {formatDateTime(record.updatedAt)} 수정됨
            </p>
          )}
          {isAdmin && (
            <button className="btn danger-text" style={{ marginTop: 16 }} onClick={remove}>
              기록 삭제 (관리자)
            </button>
          )}
        </>
      )}
      {sheet}
      {toast}
    </div>
  );
}
