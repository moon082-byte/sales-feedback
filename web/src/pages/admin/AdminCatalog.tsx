import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminQuestion, type AdminTool, type QuestionCategory } from '../../api/client';
import { TopBar, useConfirm, useToast } from '../../components/ui';
import { CatalogList, type CatalogItem } from './CatalogList';

const SECTIONS: { category: QuestionCategory; title: string }[] = [
  { category: 'Q1', title: 'Q1. 파악하지 못한 부분' },
  { category: 'Q2', title: 'Q2. 영업멘트 · 비언어적 요소' },
];

/** 도구 / 평가 문항 관리. 기록에 쓰인 항목은 삭제 대신 숨김 처리된다 */
export default function AdminCatalog({ kind }: { kind: 'tools' | 'questions' }) {
  const [tools, setTools] = useState<AdminTool[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, showToast] = useToast();
  const [sheet, confirm] = useConfirm();

  const load = useCallback(async () => {
    try {
      const r = await api<{ tools: AdminTool[]; questions: AdminQuestion[] }>('/admin/catalog');
      setTools(r.tools);
      setQuestions(r.questions);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '불러오지 못했어요.');
    } finally {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 요청 실패 시 토스트 + 서버 상태로 다시 동기화 */
  const run = async (fn: () => Promise<unknown>, done?: string): Promise<boolean> => {
    try {
      await fn();
      if (done) showToast(done);
      await load();
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '저장하지 못했어요.');
      await load();
      return false;
    }
  };

  const base = kind === 'tools' ? '/admin/tools' : '/admin/questions';
  const field = kind === 'tools' ? 'name' : 'text';

  const handlers = (category?: QuestionCategory) => ({
    onAdd: (label: string) =>
      run(() => api(base, { method: 'POST', body: kind === 'tools' ? { name: label } : { category, text: label } }), '추가했어요'),
    onRename: (id: number, label: string) => run(() => api(`${base}/${id}`, { method: 'PATCH', body: { [field]: label } })),
    onToggle: (id: number, isActive: boolean) => {
      // 낙관적 업데이트
      if (kind === 'tools') setTools((ts) => ts.map((t) => (t.id === id ? { ...t, isActive } : t)));
      else setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, isActive } : q)));
      void run(() => api(`${base}/${id}`, { method: 'PATCH', body: { isActive } }));
    },
    onReorder: (ids: number[]) => {
      if (kind === 'tools') setTools((ts) => ids.map((id) => ts.find((t) => t.id === id)!));
      else setQuestions((qs) => [...qs.filter((q) => q.category !== category), ...ids.map((id) => qs.find((q) => q.id === id)!)]);
      void run(() => api(`${base}/reorder`, { method: 'POST', body: kind === 'tools' ? { ids } : { category, ids } }));
    },
    onDelete: async (item: CatalogItem) => {
      const ok = await confirm({
        title: `'${item.label}'을(를) 삭제할까요?`,
        message: '이미 기록에 쓰인 항목은 기존 기록 보존을 위해 삭제 대신 숨김 처리돼요.',
        confirmText: '삭제',
        danger: true,
      });
      if (!ok) return;
      try {
        const r = await api<{ result: 'deleted' | 'deactivated' }>(`${base}/${item.id}`, { method: 'DELETE' });
        showToast(r.result === 'deleted' ? '삭제했어요' : '기록에 사용 중이라 숨김 처리했어요');
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : '삭제하지 못했어요.');
      }
      await load();
    },
  });

  const toItems = (list: (AdminTool | AdminQuestion)[]): CatalogItem[] =>
    list.map((i) => ({ id: i.id, label: 'name' in i ? i.name : i.text, isActive: i.isActive }));

  return (
    <div className="app">
      <TopBar title={kind === 'tools' ? '도구 관리' : '평가 문항 관리'} />
      <p className="row-desc" style={{ margin: '4px 4px 0' }}>
        이름을 눌러 수정하고, 스위치로 작성 화면 노출 여부를 정해요. 숨긴 항목도 기존 기록에는 그대로 남아요.
      </p>
      {!loaded && <div className="empty">불러오는 중…</div>}
      {loaded && kind === 'tools' && (
        <section className="card">
          <CatalogList items={toItems(tools)} maxLength={40} placeholder="새 도구 이름" {...handlers()} />
        </section>
      )}
      {loaded &&
        kind === 'questions' &&
        SECTIONS.map((s) => (
          <section className="card" key={s.category}>
            <h2 className="card-title">{s.title}</h2>
            <CatalogList
              items={toItems(questions.filter((q) => q.category === s.category))}
              maxLength={100}
              placeholder="새 문항"
              {...handlers(s.category)}
            />
          </section>
        ))}
      {sheet}
      {toast}
    </div>
  );
}
