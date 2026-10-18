import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from './Icons';

export function TopBar({ title, back = true, right }: { title?: string; back?: boolean; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <div className="topbar-side">
        {back && (
          <button className="icon-btn" aria-label="뒤로" onClick={() => navigate(-1)}>
            <ChevronLeft />
          </button>
        )}
      </div>
      <div className="topbar-title">{title}</div>
      <div className="topbar-side right">{right}</div>
    </header>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 확인 바텀시트. const [sheet, confirm] = useConfirm(); if (await confirm({...})) ... */
export function useConfirm(): [ReactNode, (opts: { title: string; message?: string; confirmText?: string; danger?: boolean }) => Promise<boolean>] {
  const [state, setState] = useState<{
    title: string;
    message?: string;
    confirmText?: string;
    danger?: boolean;
    resolve: (v: boolean) => void;
  } | null>(null);

  const ask = (opts: { title: string; message?: string; confirmText?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ ...opts, resolve }));

  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  const sheet = state ? (
    <div className="sheet-backdrop" onClick={() => close(false)}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={state.title} onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">{state.title}</h2>
        {state.message && <p className="desc" style={{ margin: '8px 0 0' }}>{state.message}</p>}
        <div className="sheet-actions">
          <button className="btn ghost" onClick={() => close(false)}>
            취소
          </button>
          <button className={`btn${state.danger ? ' danger' : ''}`} onClick={() => close(true)} autoFocus>
            {state.confirmText ?? '확인'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [sheet, ask];
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg ? <div className="toast" role="status">{msg}</div> : null, setMsg];
}
