// 관리자 전용: 전체 기록, 분석, 문항·도구 관리, 사용자 권한
import { toPublicUser } from '../domain';
import type { RecordFilter } from '../repo/types';
import {
  changeRole,
  createQuestion,
  createTool,
  deleteRecord,
  reorderQuestions,
  reorderTools,
  updateQuestion,
  updateTool,
} from '../services/admin';
import { idParam, intQuery, readJson, requireAdmin, requireAuth, type App, type Ctx } from './common';

/** ?from&to&userId(작성 또는 참여)&toolId */
function adminFilter(c: Ctx): RecordFilter {
  return {
    from: intQuery(c, 'from', undefined),
    to: intQuery(c, 'to', undefined),
    participantId: intQuery(c, 'userId', undefined, 1),
    toolId: intQuery(c, 'toolId', undefined, 1),
  };
}

export function registerAdminRoutes(app: App) {
  app.use('/admin/*', requireAuth, requireAdmin);

  // ---------- 기록 ----------
  app.get('/admin/records', async (c) => {
    const page = intQuery(c, 'page', 1, 1);
    const pageSize = intQuery(c, 'pageSize', 10, 1, 50);
    const { items, total } = await c.get('deps').repos.records.list(adminFilter(c), pageSize, (page - 1) * pageSize);
    return c.json({ items, total, page, pageSize });
  });

  app.delete('/admin/records/:id', async (c) => {
    await deleteRecord(c.get('deps'), idParam(c));
    return c.json({ ok: true });
  });

  // ---------- 분석 ----------
  app.get('/admin/stats', async (c) => {
    const deps = c.get('deps');
    const analytics = await deps.repos.records.analytics(adminFilter(c), deps.config.tzOffsetMinutes);
    return c.json({ ...analytics, tzOffsetMinutes: deps.config.tzOffsetMinutes });
  });

  // ---------- 도구·문항 ----------
  app.get('/admin/catalog', async (c) => {
    const { catalog } = c.get('deps').repos;
    const [tools, questions] = await Promise.all([catalog.listTools(false), catalog.listQuestions(false)]);
    return c.json({ tools, questions });
  });

  app.post('/admin/tools', async (c) => c.json({ tool: await createTool(c.get('deps'), await readJson(c)) }, 201));
  app.post('/admin/tools/reorder', async (c) => {
    await reorderTools(c.get('deps'), await readJson(c));
    return c.json({ ok: true });
  });
  app.patch('/admin/tools/:id', async (c) => c.json({ tool: await updateTool(c.get('deps'), idParam(c), await readJson(c)) }));
  app.delete('/admin/tools/:id', async (c) => {
    const result = await c.get('deps').repos.catalog.deleteTool(idParam(c));
    if (result === 'not_found') return c.json({ error: '도구를 찾을 수 없어요.' }, 404);
    return c.json({ result });
  });

  app.post('/admin/questions', async (c) => c.json({ question: await createQuestion(c.get('deps'), await readJson(c)) }, 201));
  app.post('/admin/questions/reorder', async (c) => {
    await reorderQuestions(c.get('deps'), await readJson(c));
    return c.json({ ok: true });
  });
  app.patch('/admin/questions/:id', async (c) =>
    c.json({ question: await updateQuestion(c.get('deps'), idParam(c), await readJson(c)) }),
  );
  app.delete('/admin/questions/:id', async (c) => {
    const result = await c.get('deps').repos.catalog.deleteQuestion(idParam(c));
    if (result === 'not_found') return c.json({ error: '문항을 찾을 수 없어요.' }, 404);
    return c.json({ result });
  });

  // ---------- 사용자 ----------
  app.get('/admin/users', async (c) => {
    const users = await c.get('deps').repos.users.listAll();
    return c.json({ users: users.map(toPublicUser) });
  });

  app.patch('/admin/users/:id', async (c) => {
    const body = await readJson(c);
    const user = await changeRole(c.get('deps'), idParam(c), body.role);
    return c.json({ user: toPublicUser(user) });
  });
}
