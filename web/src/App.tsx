import { useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AdminCatalog from './pages/admin/AdminCatalog';
import AdminHome from './pages/admin/AdminHome';
import AdminRecords from './pages/admin/AdminRecords';
import AdminStats from './pages/admin/AdminStats';
import AdminUsers from './pages/admin/AdminUsers';
import Inbox from './pages/Inbox';
import Login from './pages/Login';
import Main from './pages/Main';
import Nickname from './pages/Nickname';
import RecordDetail from './pages/RecordDetail';
import RecordForm from './pages/RecordForm';
import Records from './pages/Records';
import Settings from './pages/Settings';

/** 로그인 여부와 닉네임 설정 여부에 따라 화면을 강제 */
function Gate({ children, onboarding = false }: { children: ReactNode; onboarding?: boolean }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <div className="splash">불러오는 중…</div>;
  if (status === 'anon' || !user) return <Navigate to="/login" replace />;
  if (!user.nickname && !onboarding) return <Navigate to="/onboarding" replace />;
  if (user.nickname && onboarding) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** 관리자 전용 화면 (실제 권한 검사는 서버에서) */
function AdminGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <Gate>
      {user?.role === 'admin' ? children : <Navigate to="/" replace />}
    </Gate>
  );
}

/** 화면 이동 시 맨 위로 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function LoginRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="splash">불러오는 중…</div>;
  if (status === 'ready') return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/onboarding" element={<Gate onboarding><Nickname /></Gate>} />
          <Route path="/" element={<Gate><Main /></Gate>} />
          <Route path="/settings" element={<Gate><Settings /></Gate>} />
          <Route path="/settings/nickname" element={<Gate><Nickname edit /></Gate>} />
          <Route path="/inbox" element={<Gate><Inbox /></Gate>} />
          <Route path="/records" element={<Gate><Records /></Gate>} />
          <Route path="/records/new" element={<Gate><RecordForm /></Gate>} />
          <Route path="/records/:id" element={<Gate><RecordDetail /></Gate>} />
          <Route path="/records/:id/edit" element={<Gate><RecordForm /></Gate>} />
          <Route path="/admin" element={<AdminGate><AdminHome /></AdminGate>} />
          <Route path="/admin/stats" element={<AdminGate><AdminStats /></AdminGate>} />
          <Route path="/admin/records" element={<AdminGate><AdminRecords /></AdminGate>} />
          <Route path="/admin/tools" element={<AdminGate><AdminCatalog key="tools" kind="tools" /></AdminGate>} />
          <Route path="/admin/questions" element={<AdminGate><AdminCatalog key="questions" kind="questions" /></AdminGate>} />
          <Route path="/admin/users" element={<AdminGate><AdminUsers /></AdminGate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
