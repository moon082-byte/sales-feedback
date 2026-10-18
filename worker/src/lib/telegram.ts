export interface TelegramClient {
  sendMessage(chatId: string, text: string, opts?: { html?: boolean }): Promise<boolean>;
}

export function createTelegramClient(botToken: string): TelegramClient {
  return {
    async sendMessage(chatId, text, opts) {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: opts?.html ? 'HTML' : undefined,
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) console.warn('telegram sendMessage failed', res.status, await res.text());
      return res.ok;
    },
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
