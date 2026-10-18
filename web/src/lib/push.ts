import { api } from '../api/client';

export type PushSupport = 'supported' | 'unsupported' | 'needs-install' | 'denied';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  // iOS 는 홈 화면에 추가한(standalone) PWA 에서만 Web Push 를 지원 (16.4+)
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'supported';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('서비스워커를 준비하지 못했어요.')), 10_000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/** 권한 요청 → 구독 → 서버 등록 */
export async function enablePush(): Promise<void> {
  const { publicKey } = await api<{ publicKey: string | null }>('/push/public-key');
  if (!publicKey) throw new Error('서버에 푸시 알림이 아직 설정되지 않았어요.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('브라우저에서 알림 권한을 허용해 주세요.');

  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
}

/** 이 기기의 구독 해지 */
export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await registration().catch(() => null);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api('/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}
