// 고정 오프셋 시간대 계산 (서비스 기준 시간대, 기본 KST +540분)
const DAY = 24 * 60 * 60 * 1000;

/** now 가 속한 날의 0시 (epoch ms) */
export function zonedDayStart(now: number, tzOffsetMinutes: number): number {
  const offset = tzOffsetMinutes * 60 * 1000;
  return Math.floor((now + offset) / DAY) * DAY - offset;
}

/** 0 = 일요일 */
export function zonedWeekday(now: number, tzOffsetMinutes: number): number {
  return new Date(now + tzOffsetMinutes * 60 * 1000).getUTCDay();
}

/** "10월 18일" */
export function zonedDateLabel(ms: number, tzOffsetMinutes: number): string {
  const d = new Date(ms + tzOffsetMinutes * 60 * 1000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

export { DAY };
