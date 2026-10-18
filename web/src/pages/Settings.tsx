import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from '../components/Icons';
import { api, ApiError, type UserSettings } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Segmented, Toggle, TopBar, useToast } from '../components/ui';
import { disablePush, enablePush, pushSupport, type PushSupport } from '../lib/push';
import { getThemePref, setThemePref, type ThemePref } from '../theme';

const PUSH_DESC: Record<PushSupport, string> = {
  supported: '동료 평가를 받으면 이 기기로 알림을 보내요',
  'needs-install': 'iPhone은 Safari 공유 → 홈 화면에 추가한 앱에서 켤 수 있어요',
  unsupported: '이 브라우저는 푸시 알림을 지원하지 않아요',
  denied: '브라우저 설정에서 이 사이트의 알림을 허용해 주세요',
};

export default function Settings() {
  const { user, settings, setSettings, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const [toast, showToast] = useToast();
  const [support, setSupport] = useState<PushSupport>(pushSupport);
  const [pushBusy, setPushBusy] = useState(false);

  const changeTheme = (t: ThemePref) => {
    setTheme(t);
    setThemePref(t);
  };

  const update = async (patch: Partial<UserSettings>) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, ...patch });
    try {
      const res = await api<{ settings: UserSettings }>('/me/settings', { method: 'PATCH', body: patch });
      setSettings(res.settings);
    } catch (err) {
      setSettings(prev);
      showToast(err instanceof ApiError ? err.message : '저장하지 못했어요.');
    }
  };

  const togglePush = async (on: boolean) => {
    setPushBusy(true);
    try {
      if (on) await enablePush();
      else await disablePush();
      await update({ notifyPush: on });
      showToast(on ? '이 기기에서 푸시 알림을 받아요' : '푸시 알림을 껐어요');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '설정하지 못했어요.');
    } finally {
      setPushBusy(false);
      setSupport(pushSupport());
    }
  };

  const s = settings ??{ notifyTelegram: true, notifyPush: false, reportDaily: true, reportWeekly: true };

  return (
    <div className="app">
      <TopBar title="설정" />

      <div className="section-label">내 정보</div>
      <section className="card" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div className="row">
          <div>
            <div className="row-label">
              {user?.nickname}
              <span className="profile-tag">#{user?.tag}</span>
            </div>
            <div className="row-desc">{user?.role === 'admin' ? '관리자' : '일반 사용자'}</div>
          </div>
          <button className="btn secondary" style={{ width: 'auto', height: 36, padding: '0 14px', fontSize: 14 }} onClick={() => navigate('/settings/nickname')}>
            닉네임 변경
          </button>
        </div>
      </section>

      {user?.role === 'admin' && (
        <>
          <div className="section-label">관리자</div>
          <section className="card" style={{ padding: '8px 8px' }}>
            <Link to="/admin" className="menu-item">
              <span style={{ flex: 1 }}>
                <span className="row-label" style={{ display: 'block' }}>
                  관리자 메뉴
                </span>
                <span className="row-desc">분석 · 전체 기록 · 문항 · 도구 · 권한</span>
              </span>
              <span className="muted" aria-hidden="true">
                <ChevronRight />
              </span>
            </Link>
          </section>
        </>
      )}

      <div className="section-label">테마</div>
      <section className="card">
        <Segmented
          value={theme}
          onChange={changeTheme}
          options={[
            { value: 'system', label: '시스템' },
            { value: 'light', label: '라이트' },
            { value: 'dark', label: '다크' },
          ]}
        />
      </section>

      <div className="section-label">텔레그램 알림</div>
      <section className="card" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div className="row">
          <div>
            <div className="row-label">동료 평가 알림</div>
            <div className="row-desc">동료가 나를 태그해 기록하면 알려드려요</div>
          </div>
          <Toggle label="동료 평가 알림" checked={s.notifyTelegram} onChange={(v) => update({ notifyTelegram: v })} />
        </div>
        <div className="row">
          <div>
            <div className="row-label">일일 리포트</div>
            <div className="row-desc">매일 21시, 오늘 받은 평가 요약 (받은 날만)</div>
          </div>
          <Toggle label="일일 리포트" checked={s.reportDaily} onChange={(v) => update({ reportDaily: v })} />
        </div>
        <div className="row">
          <div>
            <div className="row-label">주간 리포트</div>
            <div className="row-desc">일요일 21시, 최근 7일 평가 요약</div>
          </div>
          <Toggle label="주간 리포트" checked={s.reportWeekly} onChange={(v) => update({ reportWeekly: v })} />
        </div>
      </section>

      <div className="section-label">시스템 알림</div>
      <section className="card" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div className="row">
          <div>
            <div className="row-label">푸시 알림</div>
            <div className="row-desc">{PUSH_DESC[support]}</div>
          </div>
          <Toggle
            label="푸시 알림"
            checked={s.notifyPush && support === 'supported'}
            disabled={support !== 'supported' || pushBusy}
            onChange={togglePush}
          />
        </div>
      </section>

      <button className="btn danger-text" style={{ marginTop: 24 }} onClick={() => void logout()}>
        로그아웃
      </button>
      {toast}
    </div>
  );
}
