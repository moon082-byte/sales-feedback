import type { Deps } from '../deps';
import { displayName } from '../domain';
import { escapeHtml } from '../lib/telegram';
import { DAY, zonedDateLabel, zonedDayStart } from '../lib/time';
import type { ReceivedDigest } from '../repo/types';

export type ReportKind = 'daily' | 'weekly';

const TOP_ITEMS = 5;

/** 일일: 오늘 0시 ~ 지금, 주간: 6일 전 0시 ~ 지금 (오늘 포함 7일) */
export function reportRange(kind: ReportKind, now: number, tz: number) {
  const today = zonedDayStart(now, tz);
  const from = kind === 'daily' ? today : today - 6 * DAY;
  const label = kind === 'daily' ? zonedDateLabel(now, tz) : `${zonedDateLabel(from, tz)} ~ ${zonedDateLabel(now, tz)}`;
  return { from, to: now + 1, label };
}

export function formatReport(kind: ReportKind, label: string, digest: ReceivedDigest | undefined, webAppUrl: string): string {
  const title = kind === 'daily' ? '오늘 받은 평가' : '최근 7일 받은 평가';
  const lines = [`📊 <b>${title}</b> · ${escapeHtml(label)}`];

  if (!digest || digest.count === 0) {
    lines.push('', kind === 'daily' ? '오늘 받은 평가가 없어요.' : '이번 주에 받은 평가가 없어요. 동료와 함께 영업하고 기록을 남겨 보세요!');
  } else {
    lines.push(`받은 평가 <b>${digest.count}건</b> · 번호교환 ${digest.phoneExchanged}건`);
    lines.push('', '<b>평가해 준 동료</b>');
    lines.push(escapeHtml(digest.authors.map((a) => `${displayName(a.user)} ${a.count}건`).join(', ')));

    for (const [cat, heading] of [
      ['Q1', '파악하지 못한 부분'],
      ['Q2', '영업멘트 · 비언어'],
    ] as const) {
      const items = digest.questions.filter((q) => q.category === cat).slice(0, TOP_ITEMS);
      if (!items.length) continue;
      lines.push('', `<b>${heading}</b>`);
      for (const q of items) lines.push(`· ${escapeHtml(q.text)} ${q.count}`);
    }
  }

  if (webAppUrl) lines.push('', escapeHtml(`${webAppUrl}#/records`));
  return lines.join('\n');
}

export interface ReportRunResult {
  kind: ReportKind;
  targets: number;
  sent: number;
  skipped: number;
  failed: number;
  /** 호출당 발송 한도 초과로 보내지 못한 수 */
  deferred: number;
  /** dryRun 일 때만 */
  messages?: { userId: number; text: string }[];
}

/**
 * 리포트를 켠 사용자 전체에게 발송.
 * 일일 리포트는 받은 평가가 없으면 보내지 않고, 주간 리포트는 0건이어도 보낸다.
 */
export async function runReports(deps: Deps, kind: ReportKind, now: number, opts: { dryRun?: boolean } = {}): Promise<ReportRunResult> {
  const tz = deps.config.tzOffsetMinutes;
  const { from, to, label } = reportRange(kind, now, tz);
  const [targets, digests] = await Promise.all([
    deps.repos.users.findReportTargets(kind),
    deps.repos.records.receivedDigests(from, to),
  ]);

  const result: ReportRunResult = { kind, targets: targets.length, sent: 0, skipped: 0, failed: 0, deferred: 0 };
  if (opts.dryRun) result.messages = [];

  for (const t of targets) {
    const digest = digests.get(t.id);
    if (kind === 'daily' && !digest?.count) {
      result.skipped++;
      continue;
    }
    const text = formatReport(kind, label, digest, deps.config.webAppUrl);
    if (opts.dryRun) {
      result.messages!.push({ userId: t.id, text });
      result.sent++;
      continue;
    }
    if (result.sent + result.failed >= deps.config.reportMaxSends) {
      result.deferred++;
      continue;
    }
    if (await deps.telegram.sendMessage(t.chatId, text, { html: true })) result.sent++;
    else result.failed++;
  }

  if (result.deferred) {
    console.warn(`report ${kind}: ${result.deferred}명은 발송 한도(${deps.config.reportMaxSends}) 초과로 보내지 못했습니다. REPORT_MAX_SENDS 또는 플랜을 확인하세요.`);
  }
  return result;
}

/** 봇 명령(/today, /week)으로 본인 리포트를 즉시 받기 */
export async function buildReportFor(deps: Deps, userId: number, kind: ReportKind, now: number): Promise<string> {
  const { from, to, label } = reportRange(kind, now, deps.config.tzOffsetMinutes);
  const digests = await deps.repos.records.receivedDigests(from, to);
  return formatReport(kind, label, digests.get(userId), deps.config.webAppUrl);
}
