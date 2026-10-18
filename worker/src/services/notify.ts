import type { Deps } from '../deps';
import { displayName, type RecordDetail } from '../domain';
import { escapeHtml } from '../lib/telegram';

export const NOTIFICATION_TYPES = { recordTagged: 'record_tagged' } as const;

/** 기록에 새로 태그된 동료에게 알림: 알림함은 즉시 저장, 텔레그램/푸시는 응답 후 발송 */
export async function notifyTaggedPeers(deps: Deps, record: RecordDetail, peerIds: number[]): Promise<void> {
  if (!peerIds.length) return;
  await deps.repos.notifications.createMany(
    peerIds.map((userId) => ({
      userId,
      type: NOTIFICATION_TYPES.recordTagged,
      recordId: record.id,
      actorId: record.author.id,
    })),
    deps.now(),
  );
  deps.defer(sendExternal(deps, record, peerIds));
}

function recordUrl(deps: Deps, recordId: number): string {
  return deps.config.webAppUrl ? `${deps.config.webAppUrl}#/records/${recordId}` : '';
}

async function sendExternal(deps: Deps, record: RecordDetail, peerIds: number[]): Promise<void> {
  const targets = await deps.repos.users.findNotifyTargets(peerIds);
  const author = displayName(record.author);
  const q1 = record.answers.filter((a) => a.category === 'Q1').length;
  const q2 = record.answers.filter((a) => a.category === 'Q2').length;
  const detail = [
    record.tool ? `도구: ${record.tool.name}` : null,
    `번호교환 ${record.phoneExchanged ? 'O' : 'X'}`,
    `파악 못한 부분 ${q1} · 멘트/비언어 ${q2}`,
  ]
    .filter(Boolean)
    .join('\n');

  const url = recordUrl(deps, record.id);
  const telegramText = [
    `🔔 <b>${escapeHtml(author)}</b>님이 함께한 영업 평가를 남겼어요`,
    escapeHtml(detail),
    url ? `\n${escapeHtml(url)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const pushPayload = JSON.stringify({
    title: '새 영업 평가',
    body: `${author}님이 함께한 영업 평가를 남겼어요`,
    url: `#/records/${record.id}`,
    tag: `record-${record.id}`,
  });

  await Promise.allSettled(
    targets.map(async (t) => {
      if (t.notifyTelegram && t.chatId) {
        await deps.telegram.sendMessage(t.chatId, telegramText, { html: true });
      }
      if (t.notifyPush && deps.push) {
        const subs = await deps.repos.push.listForUser(t.id);
        await Promise.allSettled(
          subs.map(async (s) => {
            const res = await deps.push!.send(s, pushPayload);
            if (res.gone) await deps.repos.push.removeByEndpoint(s.endpoint);
          }),
        );
      }
    }),
  );
}
