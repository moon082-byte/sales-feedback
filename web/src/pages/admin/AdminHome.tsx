import { Link } from 'react-router-dom';
import { ChevronRight } from '../../components/Icons';
import { TopBar } from '../../components/ui';

const MENU = [
  { to: '/admin/stats', label: '분석', desc: '기간 · 사용자 · 도구별 집계' },
  { to: '/admin/records', label: '전체 기록', desc: '모든 영업 기록 열람 · 수정 · 삭제' },
  { to: '/admin/questions', label: '평가 문항', desc: 'Q1 · Q2 체크리스트 관리' },
  { to: '/admin/tools', label: '도구', desc: '영업 아이템 목록 관리' },
  { to: '/admin/users', label: '사용자 권한', desc: '관리자 지정 · 해제' },
];

export default function AdminHome() {
  return (
    <div className="app">
      <TopBar title="관리자" />
      <section className="card" style={{ padding: '8px 8px' }}>
        {MENU.map((m) => (
          <Link key={m.to} to={m.to} className="menu-item">
            <span style={{ flex: 1 }}>
              <span className="row-label" style={{ display: 'block' }}>
                {m.label}
              </span>
              <span className="row-desc">{m.desc}</span>
            </span>
            <span className="muted" aria-hidden="true">
              <ChevronRight />
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
