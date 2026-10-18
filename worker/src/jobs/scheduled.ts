// 정기 작업 (Workers Cron Trigger 또는 다른 런타임의 스케줄러가 호출)
import type { Deps } from '../deps';
import { zonedWeekday } from '../lib/time';
import { runReports, type ReportRunResult } from '../services/reports';

/**
 * 하루 한 번(기본 21:00 KST) 실행:
 * 만료 데이터 정리 → 일일 리포트 → (일요일이면) 주간 리포트
 */
export async function runDailyJobs(deps: Deps, scheduledTime: number): Promise<ReportRunResult[]> {
  await deps.repos.maintenance.cleanup(scheduledTime);
  const results = [await runReports(deps, 'daily', scheduledTime)];
  if (zonedWeekday(scheduledTime, deps.config.tzOffsetMinutes) === 0) {
    results.push(await runReports(deps, 'weekly', scheduledTime));
  }
  console.log('scheduled reports', JSON.stringify(results));
  return results;
}
