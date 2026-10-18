import type { Deps } from '../deps';
import { AppError, type RecordAnswer, type RecordDetail, type User } from '../domain';
import type { RecordFilter, RecordWriteInput } from '../repo/types';
import { notifyTaggedPeers } from './notify';

const MAX_PEERS = 20;
const MAX_CUSTOMER_INFO = 2000;
const MAX_REASON = 500;

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** 요청 본문을 검증해 저장 가능한 입력으로 변환. existing 은 수정 시 기존 기록 */
async function parseWriteInput(deps: Deps, me: User, raw: unknown, existing?: RecordDetail): Promise<RecordWriteInput> {
  const body = asObject(raw);

  // 동료
  const rawPeers = Array.isArray(body.peerIds) ? body.peerIds : [];
  if (!rawPeers.every(isId)) throw new AppError(400, '동료 정보가 올바르지 않아요.');
  const authorId = existing?.author.id ?? me.id;
  const peerIds = [...new Set(rawPeers as number[])].filter((id) => id !== authorId);
  if (peerIds.length > MAX_PEERS) throw new AppError(400, `동료는 최대 ${MAX_PEERS}명까지 선택할 수 있어요.`);
  const found = await deps.repos.users.findActiveByIds(peerIds);
  if (found.length !== peerIds.length) throw new AppError(400, '존재하지 않는 동료가 포함되어 있어요.');

  // 도구: 활성 도구가 있으면 필수. 수정 시 기존 도구는 비활성이어도 유지 가능
  const tools = await deps.repos.catalog.listTools(true);
  let toolId: number | null = null;
  if (body.toolId !== undefined && body.toolId !== null) {
    if (!isId(body.toolId)) throw new AppError(400, '도구 정보가 올바르지 않아요.');
    const allowed = tools.some((t) => t.id === body.toolId) || existing?.tool?.id === body.toolId;
    if (!allowed) throw new AppError(400, '선택할 수 없는 도구예요.');
    toolId = body.toolId;
  } else if (tools.length) {
    throw new AppError(400, '도구를 선택해 주세요.');
  }

  if (typeof body.phoneExchanged !== 'boolean') throw new AppError(400, '번호교환 여부를 선택해 주세요.');

  const customerInfo = typeof body.customerInfo === 'string' ? body.customerInfo.trim() : '';
  if (customerInfo.length > MAX_CUSTOMER_INFO) throw new AppError(400, `고객정보는 ${MAX_CUSTOMER_INFO}자 이내로 입력해 주세요.`);

  // 평가 체크 항목: 활성 문항 + (수정 시) 기존에 체크돼 있던 문항
  const questions = await deps.repos.catalog.listQuestions(true);
  const allowed = new Map<number, Omit<RecordAnswer, 'reason'>>();
  for (const q of questions) allowed.set(q.id, { questionId: q.id, category: q.category, questionText: q.text });
  for (const a of existing?.answers ?? []) {
    if (!allowed.has(a.questionId)) allowed.set(a.questionId, { questionId: a.questionId, category: a.category, questionText: a.questionText });
  }
  const rawAnswers = Array.isArray(body.answers) ? body.answers : [];
  const answers: RecordAnswer[] = [];
  const seen = new Set<number>();
  for (const item of rawAnswers) {
    const a = asObject(item);
    if (!isId(a.questionId) || seen.has(a.questionId)) continue;
    const q = allowed.get(a.questionId);
    if (!q) throw new AppError(400, '선택할 수 없는 평가 문항이 포함되어 있어요.');
    const reason = typeof a.reason === 'string' ? a.reason.trim() : '';
    if (reason.length > MAX_REASON) throw new AppError(400, `이유는 ${MAX_REASON}자 이내로 입력해 주세요.`);
    seen.add(a.questionId);
    answers.push({ ...q, reason });
  }

  return { toolId, phoneExchanged: body.phoneExchanged, customerInfo, peerIds, answers };
}

export function canRead(me: User, record: RecordDetail): boolean {
  return me.role === 'admin' || record.author.id === me.id || record.peers.some((p) => p.id === me.id);
}

export async function createRecord(deps: Deps, me: User, body: unknown): Promise<RecordDetail> {
  const input = await parseWriteInput(deps, me, body);
  const id = await deps.repos.records.create({ ...input, authorId: me.id, now: deps.now() });
  const record = (await deps.repos.records.findById(id))!;
  await notifyTaggedPeers(deps, record, input.peerIds);
  return record;
}

/** 작성자 본인 또는 관리자만 수정. 새로 추가된 동료에게만 알림 */
export async function updateRecord(deps: Deps, me: User, id: number, body: unknown): Promise<RecordDetail> {
  const existing = await deps.repos.records.findById(id);
  if (!existing) throw new AppError(404, '기록을 찾을 수 없어요.');
  if (existing.author.id !== me.id && me.role !== 'admin') throw new AppError(403, '수정 권한이 없어요.');

  const input = await parseWriteInput(deps, me, body, existing);
  await deps.repos.records.update(id, { ...input, updatedBy: me.id, now: deps.now() });
  const record = (await deps.repos.records.findById(id))!;
  const before = new Set(existing.peers.map((p) => p.id));
  await notifyTaggedPeers(
    deps,
    record,
    input.peerIds.filter((pid) => !before.has(pid)),
  );
  return record;
}

export async function getRecord(deps: Deps, me: User, id: number): Promise<RecordDetail> {
  const record = await deps.repos.records.findById(id);
  if (!record || !canRead(me, record)) throw new AppError(404, '기록을 찾을 수 없어요.');
  return record;
}

export type ListScope = 'received' | 'written';

export function scopeFilter(me: User, scope: ListScope): RecordFilter {
  return scope === 'written' ? { authorId: me.id } : { peerId: me.id };
}
