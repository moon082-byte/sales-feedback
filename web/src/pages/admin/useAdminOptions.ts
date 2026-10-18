import { useEffect, useState } from 'react';
import { api, type AdminQuestion, type AdminTool, type PublicUser } from '../../api/client';

/** 필터용 사용자·도구 목록 (비활성 도구 포함) */
export function useAdminOptions() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [tools, setTools] = useState<AdminTool[]>([]);
  useEffect(() => {
    api<{ users: PublicUser[] }>('/admin/users')
      .then((r) => setUsers(r.users))
      .catch(() => {});
    api<{ tools: AdminTool[]; questions: AdminQuestion[] }>('/admin/catalog')
      .then((r) => setTools(r.tools))
      .catch(() => {});
  }, []);
  return { users, tools };
}
