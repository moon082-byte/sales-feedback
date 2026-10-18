import { useState, type FormEvent } from 'react';
import { Toggle } from '../../components/ui';

export interface CatalogItem {
  id: number;
  label: string;
  isActive: boolean;
}

/** 이름 수정 · 사용 여부 · 순서 변경 · 삭제 · 추가를 지원하는 목록 */
export function CatalogList({
  items,
  maxLength,
  placeholder,
  onAdd,
  onRename,
  onToggle,
  onReorder,
  onDelete,
}: {
  items: CatalogItem[];
  maxLength: number;
  placeholder: string;
  onAdd: (label: string) => Promise<boolean>;
  onRename: (id: number, label: string) => Promise<boolean>;
  onToggle: (id: number, active: boolean) => void;
  onReorder: (ids: number[]) => void;
  onDelete: (item: CatalogItem) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const move = (index: number, delta: number) => {
    const ids = items.map((i) => i.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    onReorder(ids);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (editing === null || !draft.trim()) return;
    if (await onRename(editing, draft.trim())) setEditing(null);
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || busy) return;
    setBusy(true);
    if (await onAdd(newLabel.trim())) setNewLabel('');
    setBusy(false);
  };

  return (
    <div>
      {items.length === 0 && <div className="empty" style={{ paddingTop: 8 }}>아직 항목이 없어요</div>}
      {items.map((item, i) =>
        editing === item.id ? (
          <form key={item.id} className="catalog-row editing" onSubmit={saveEdit}>
            <input
              className="input small"
              value={draft}
              maxLength={maxLength}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="이름 수정"
              autoFocus
            />
            <div className="catalog-edit-actions">
              <button type="button" className="text-btn muted-btn" onClick={() => setEditing(null)}>
                취소
              </button>
              <button type="submit" className="text-btn" disabled={!draft.trim()}>
                저장
              </button>
            </div>
          </form>
        ) : (
          <div key={item.id} className={`catalog-row${item.isActive ? '' : ' inactive'}`}>
            <div className="order-btns">
              <button type="button" className="mini-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${item.label} 위로`}>
                ▲
              </button>
              <button type="button" className="mini-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`${item.label} 아래로`}>
                ▼
              </button>
            </div>
            <button
              type="button"
              className="catalog-label"
              onClick={() => {
                setEditing(item.id);
                setDraft(item.label);
              }}
              aria-label={`${item.label} 이름 수정`}
            >
              {item.label}
              {!item.isActive && <span className="badge" style={{ marginLeft: 8 }}>숨김</span>}
            </button>
            <Toggle label={`${item.label} 사용`} checked={item.isActive} onChange={(v) => onToggle(item.id, v)} />
            <button type="button" className="mini-btn danger" onClick={() => onDelete(item)} aria-label={`${item.label} 삭제`}>
              삭제
            </button>
          </div>
        ),
      )}
      <form className="catalog-add" onSubmit={add}>
        <input
          className="input small"
          placeholder={placeholder}
          value={newLabel}
          maxLength={maxLength}
          onChange={(e) => setNewLabel(e.target.value)}
          aria-label={placeholder}
        />
        <button type="submit" className="btn secondary add-btn" disabled={!newLabel.trim() || busy}>
          추가
        </button>
      </form>
    </div>
  );
}
