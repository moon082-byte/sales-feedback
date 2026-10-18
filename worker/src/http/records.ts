// 영업 기록, 요약 통계, 도구/문항 목록
import { AppError } from '../domain';
import { createRecord, getRecord, scopeFilter, updateRecord, type ListScope } from '../services/records';
import { idParam, intQuery, readJson, requireAuth, type App, type Ctx } from './common';

const DAY = 24 * 60 * 60 * 1000;

function scopeQuery(c: Ctx): ListScope {
  const s = c.req.query('scope') ?? 'received';
  if (s !== 'received' && s !== 'written') throw new AppError(400, 'scope 값이 올바르지 않아요.');
  return s;
}

export function registerRecordRoutes(app: App) {
  app.get('/catalog', requireAuth, async (c) => {
    const { catalog } = c.get('deps').repos;
    const [tools, questions] = await Promise.all([catalog.listTools(true), catalog.listQuestions(true)]);
    return c.json({ tools, questions });
  });

  app.post('/records', requireAuth, async (c) => {
    const record = await createRecord(c.get('deps'), c.get('user'), await readJson(c));
    return c.json({ record }, 201);
  });

  /** ?scope=received|written&from&to&page&pageSize */
  app.get('/records', requireAuth, async (c) => {
    const page = intQuery(c, 'page', 1, 1);
    const pageSize = intQuery(c, 'pageSize', 10, 1, 50);
    const filter = {
      ...scopeFilter(c.get('user'), scopeQuery(c)),
      from: intQuery(c, 'from', undefined),
      to: intQuery(c, 'to', undefined),
    };
    const { items, total } = await c.get('deps').repos.records.list(filter, pageSize, (page - 1) * pageSize);
    return c.json({ items, total, page, pageSize });
  });

  /** 캘린더 표시용: 기간 내 기록 시각 목록 (날짜 묶음은 클라이언트 시간대로 계산) */
  app.get('/records/timestamps', requireAuth, async (c) => {
    const from = intQuery(c, 'from', 0);
    const to = intQuery(c, 'to', from + 45 * DAY);
    if (to - from > 62 * DAY) throw new AppError(400, '조회 기간이 너무 길어요.');
    const timestamps = await c
      .get('deps')
      .repos.records.timestamps({ ...scopeFilter(c.get('user'), scopeQuery(c)), from, to }, 2000);
    return c.json({ timestamps });
  });

  app.get('/records/:id', requireAuth, async (c) => {
    const record = await getRecord(c.get('deps'), c.get('user'), idParam(c));
    return c.json({ record });
  });

  app.patch('/records/:id', requireAuth, async (c) => {
    const record = await updateRecord(c.get('deps'), c.get('user'), idParam(c), await readJson(c));
    return c.json({ record });
  });

  /** 최근 요약: 내가 작성했거나 동료로 참여한 기록 기준. 기본 최근 7일 */
  app.get('/stats/summary', requireAuth, async (c) => {
    const deps = c.get('deps');
    const to = intQuery(c, 'to', deps.now() + 1);
    const from = intQuery(c, 'from', to - 7 * DAY);
    const stats = await deps.repos.records.stats({ participantId: c.get('user').id, from, to });
    return c.json({ from, to, sales: stats.count, phoneExchanged: stats.phoneExchanged });
  });
}
