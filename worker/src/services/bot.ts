import type { Deps } from '../deps';
import { AppError } from '../domain';
import { escapeHtml } from '../lib/telegram';
import { issueLoginCode } from './auth';

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; is_bot?: boolean };
  };
}

const HELP_TEXT = [
  '영업 피드백 봇입니다.',
  '',
  '/login - 웹앱 로그인 인증코드 받기',
  '/help - 도움말',
].join('\n');

export async function handleTelegramUpdate(deps: Deps, update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text || !msg.from || msg.from.is_bot || msg.chat.type !== 'private') return;

  const chatId = String(msg.chat.id);
  const command = msg.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();

  if (command === '/start' || command === '/login') {
    try {
      const code = await issueLoginCode(deps, { telegramId: String(msg.from.id), chatId });
      const minutes = Math.round(deps.config.loginCodeTtlMs / 60000);
      const lines = [
        `인증코드: <code>${code}</code>`,
        `${minutes}분 안에 웹앱에 입력해 주세요.`,
        '이 코드는 다른 사람에게 알려주지 마세요.',
      ];
      if (deps.config.webAppUrl) lines.push('', escapeHtml(deps.config.webAppUrl));
      await deps.telegram.sendMessage(chatId, lines.join('\n'), { html: true });
    } catch (e) {
      const text = e instanceof AppError ? e.message : '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      if (!(e instanceof AppError)) console.error(e);
      await deps.telegram.sendMessage(chatId, text);
    }
    return;
  }

  await deps.telegram.sendMessage(chatId, HELP_TEXT);
}
