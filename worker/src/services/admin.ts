import type { Deps } from '../deps';
import { AppError, type QuestionCategory, type Role, type User } from '../domain';

const MAX_TOOL_NAME = 40;
const MAX_QUESTION_TEXT = 100;

function cleanText(raw: unknown, label: string, max: number): string {
  const v = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!v) throw new AppError(400, `${label}을(를) 입력해 주세요.`);
  if (v.length > max) throw new AppError(400, `${label}은(는) ${max}자 이내로 입력해 주세요.`);
  return v;
}

function optionalBool(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'boolean') throw new AppError(400, '잘못된 요청입니다.');
  return raw;
}

export function parseCategory(raw: unknown): QuestionCategory {
  if (raw !== 'Q1' && raw !== 'Q2') throw new AppError(400, '문항 구분(Q1/Q2)이 올바르지 않아요.');
  return raw;
}

// ---------- 도구 ----------
export async function createTool(deps: Deps, body: Record<string, unknown>) {
  return deps.repos.catalog.createTool(cleanText(body.name, '도구 이름', MAX_TOOL_NAME), deps.now());
}

export async function updateTool(deps: Deps, id: number, body: Record<string, unknown>) {
  const patch = {
    name: body.name === undefined ? undefined : cleanText(body.name, '도구 이름', MAX_TOOL_NAME),
    isActive: optionalBool(body.isActive),
  };
  const tool = await deps.repos.catalog.updateTool(id, patch);
  if (!tool) throw new AppError(404, '도구를 찾을 수 없어요.');
  return tool;
}

// ---------- 문항 ----------
export async function createQuestion(deps: Deps, body: Record<string, unknown>) {
  return deps.repos.catalog.createQuestion(
    parseCategory(body.category),
    cleanText(body.text, '문항', MAX_QUESTION_TEXT),
    deps.now(),
  );
}

export async function updateQuestion(deps: Deps, id: number, body: Record<string, unknown>) {
  const patch = {
    text: body.text === undefined ? undefined : cleanText(body.text, '문항', MAX_QUESTION_TEXT),
    isActive: optionalBool(body.isActive),
  };
  const q = await deps.repos.catalog.updateQuestion(id, patch);
  if (!q) throw new AppError(404, '문항을 찾을 수 없어요.');
  return q;
}

/** ids 는 대상 목록 전체를 원하는 순서로 담아야 한다 */
function assertSameSet(ids: unknown, current: number[]): number[] {
  if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n))) throw new AppError(400, '순서 정보가 올바르지 않아요.');
  const want = new Set(current);
  if (ids.length !== want.size || new Set(ids).size !== ids.length || !ids.every((id) => want.has(id))) {
    throw new AppError(409, '목록이 변경되었어요. 새로고침 후 다시 시도해 주세요.');
  }
  return ids as number[];
}

export async function reorderTools(deps: Deps, body: Record<string, unknown>) {
  const all = await deps.repos.catalog.listTools(false);
  await deps.repos.catalog.reorderTools(assertSameSet(body.ids, all.map((t) => t.id)));
}

export async function reorderQuestions(deps: Deps, body: Record<string, unknown>) {
  const category = parseCategory(body.category);
  const all = await deps.repos.catalog.listQuestions(false);
  const ids = assertSameSet(
    body.ids,
    all.filter((q) => q.category === category).map((q) => q.id),
  );
  await deps.repos.catalog.reorderQuestions(ids);
}

// ---------- 사용자 권한 ----------
export async function changeRole(deps: Deps, targetId: number, raw: unknown): Promise<User> {
  if (raw !== 'user' && raw !== 'admin') throw new AppError(400, '권한 값이 올바르지 않아요.');
  const role: Role = raw;
  const target = await deps.repos.users.findById(targetId);
  if (!target || !target.nickname) throw new AppError(404, '사용자를 찾을 수 없어요.');
  if (target.role === role) return target;
  if (role === 'user') {
    if (deps.config.adminTelegramIds.has(target.telegramId)) {
      throw new AppError(409, '환경설정(ADMIN_TELEGRAM_IDS)으로 지정된 관리자는 여기서 해제할 수 없어요.');
    }
    if ((await deps.repos.users.countAdmins()) <= 1) throw new AppError(409, '마지막 관리자는 해제할 수 없어요.');
  }
  await deps.repos.users.updateRole(targetId, role);
  return { ...target, role };
}

export async function deleteRecord(deps: Deps, id: number): Promise<void> {
  if (!(await deps.repos.records.delete(id))) throw new AppError(404, '기록을 찾을 수 없어요.');
}
