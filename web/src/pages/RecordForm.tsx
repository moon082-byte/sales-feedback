import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type PublicUser, type Question, type QuestionCategory, type RecordDetail, type Tool } from '../api/client';
import { Segmented, TopBar, useToast } from '../components/ui';
import { UserPicker } from '../components/UserPicker';

const SECTIONS: { category: QuestionCategory; title: string; desc: string }[] = [
  { category: 'Q1', title: 'Q1. 파악하지 못한 부분', desc: '고객에게서 파악하지 못한 항목을 체크하고 이유를 적어 주세요.' },
  { category: 'Q2', title: 'Q2. 영업멘트 · 비언어적 요소', desc: '아쉬웠던 멘트나 태도를 체크하고 이유를 적어 주세요.' },
];

/** 새 기록 작성 / 기존 기록 수정 (/records/:id/edit) */
export default function RecordForm() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const navigate = useNavigate();
  const [toast, showToast] = useToast();

  const [tools, setTools] = useState<Tool[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [peers, setPeers] = useState<PublicUser[]>([]);
  const [toolId, setToolId] = useState<number | null>(null);
  const [phone, setPhone] = useState<'yes' | 'no' | ''>('');
  const [customerInfo, setCustomerInfo] = useState('');
  const [checks, setChecks] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const catalog = await api<{ tools: Tool[]; questions: Question[] }>('/catalog');
        let qs = catalog.questions;
        let ts = catalog.tools;
        if (editId) {
          const { record } = await api<{ record: RecordDetail }>(`/records/${editId}`);
          setPeers(record.peers);
          setToolId(record.tool?.id ?? null);
          setPhone(record.phoneExchanged ? 'yes' : 'no');
          setCustomerInfo(record.customerInfo);
          setChecks(new Map(record.answers.map((a) => [a.questionId, a.reason])));
          // 비활성화된 문항/도구라도 기존 기록에 있던 것은 보여준다
          const known = new Set(qs.map((q) => q.id));
          qs = [...qs, ...record.answers.filter((a) => !known.has(a.questionId)).map((a) => ({ id: a.questionId, category: a.category, text: a.questionText }))];
          if (record.tool && !ts.some((t) => t.id === record.tool!.id)) ts = [...ts, record.tool];
        }
        setQuestions(qs);
        setTools(ts);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : '불러오지 못했어요.');
      } finally {
        setLoading(false);
      }
    })();
  }, [editId]);

  const toggleCheck = (qid: number) =>
    setChecks((prev) => {
      const next = new Map(prev);
      if (next.has(qid)) next.delete(qid);
      else next.set(qid, '');
      return next;
    });

  const setReason = (qid: number, reason: string) => setChecks((prev) => new Map(prev).set(qid, reason));

  const missing = useMemo(() => {
    if (tools.length && toolId === null) return '도구를 선택해 주세요';
    if (!phone) return '번호교환 여부를 선택해 주세요';
    return '';
  }, [tools.length, toolId, phone]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing || saving) return;
    setSaving(true);
    const body = {
      peerIds: peers.map((p) => p.id),
      toolId,
      phoneExchanged: phone === 'yes',
      customerInfo,
      answers: [...checks].map(([questionId, reason]) => ({ questionId, reason })),
    };
    try {
      const { record } = await api<{ record: RecordDetail }>(editId ? `/records/${editId}` : '/records', {
        method: editId ? 'PATCH' : 'POST',
        body,
      });
      navigate(`/records/${record.id}`, { replace: true, state: { saved: true } });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '저장하지 못했어요.');
      setSaving(false);
    }
  };

  if (loading) return <div className="splash">불러오는 중…</div>;
  if (loadError) {
    return (
      <div className="app">
        <TopBar title="영업 기록" />
        <section className="card">
          <div className="empty">{loadError}</div>
        </section>
      </div>
    );
  }

  return (
    <form className="app" onSubmit={submit}>
      <TopBar title={editId ? '기록 수정' : '영업 기록 작성'} />

      <section className="card">
        <h2 className="card-title">함께 영업한 동료</h2>
        <UserPicker value={peers} onChange={setPeers} />
        <p className="row-desc" style={{ marginTop: 10 }}>
          저장하면 선택한 동료에게 알림이 가요.
        </p>
      </section>

      {tools.length > 0 && (
        <section className="card">
          <h2 className="card-title">도구</h2>
          <div className="chips">
            {tools.map((t) => (
              <button key={t.id} type="button" className={`chip${toolId === t.id ? ' selected' : ''}`} aria-pressed={toolId === t.id} onClick={() => setToolId(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="card-title">번호교환</h2>
        <Segmented
          value={phone}
          onChange={setPhone}
          options={[
            { value: 'yes', label: '했어요' },
            { value: 'no', label: '못 했어요' },
          ]}
        />
      </section>

      <section className="card">
        <h2 className="card-title">파악한 고객정보</h2>
        <textarea
          className="textarea"
          rows={4}
          maxLength={2000}
          placeholder="나이대, 관심사, 현재 상황 등 파악한 내용을 적어 주세요"
          value={customerInfo}
          onChange={(e) => setCustomerInfo(e.target.value)}
          aria-label="파악한 고객정보"
        />
      </section>

      {SECTIONS.map((s) => {
        const items = questions.filter((q) => q.category === s.category);
        return (
          <section className="card" key={s.category}>
            <h2 className="card-title" style={{ marginBottom: 4 }}>
              {s.title}
            </h2>
            <p className="row-desc" style={{ margin: '0 0 8px' }}>
              {s.desc}
            </p>
            {items.length === 0 && <div className="empty">관리자가 등록한 문항이 없어요</div>}
            {items.map((q) => {
              const checked = checks.has(q.id);
              return (
                <div key={q.id} className="check-item">
                  <button type="button" className="check-row" role="checkbox" aria-checked={checked} onClick={() => toggleCheck(q.id)}>
                    <span className={`check-box${checked ? ' on' : ''}`} aria-hidden="true" />
                    <span>{q.text}</span>
                  </button>
                  {checked && (
                    <textarea
                      className="textarea reason"
                      rows={2}
                      maxLength={500}
                      placeholder="이유"
                      value={checks.get(q.id) ?? ''}
                      onChange={(e) => setReason(q.id, e.target.value)}
                      aria-label={`${q.text} 이유`}
                      autoFocus
                    />
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      <div className="bottom-cta">
        <button className="btn" type="submit" disabled={!!missing || saving}>
          {saving ? '저장 중…' : missing || (editId ? '수정 완료' : '저장하고 동료에게 보내기')}
        </button>
      </div>
      {toast}
    </form>
  );
}
