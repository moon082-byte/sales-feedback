// Web Push 발송 (VAPID RFC 8292 + 메시지 암호화 RFC 8291 aes128gcm), WebCrypto만 사용
import { base64url, base64urlDecode } from './crypto';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushResult {
  ok: boolean;
  /** 구독이 만료/해지되어 삭제해야 함 */
  gone: boolean;
  status: number;
}

export interface WebPushSender {
  send(target: PushTarget, payload: string): Promise<PushResult>;
}

export interface VapidConfig {
  publicKey: string; // base64url, 비압축 65바이트 P-256 공개키
  privateKey: string; // base64url, 32바이트 d
  subject: string; // mailto: 또는 https: URL
}

const te = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** RFC 8291 aes128gcm 단일 레코드 암호화. salt/asKeyPair 는 테스트용으로만 주입 */
export async function encryptPayload(
  target: { p256dh: string; auth: string },
  plaintext: Uint8Array,
  opts: { salt?: Uint8Array; asKeyPair?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const uaPublic = base64urlDecode(target.p256dh);
  const authSecret = base64urlDecode(target.auth);

  const asKeys =
    opts.asKeyPair ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', asKeys.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as SubtleCryptoDeriveKeyAlgorithm, asKeys.privateKey, 256),
  );

  const keyInfo = concat(te.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 마지막 레코드 구분자 0x02
  const padded = concat(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

export function createWebPushSender(cfg: VapidConfig): WebPushSender {
  let signingKey: Promise<CryptoKey> | null = null;
  const getSigningKey = () => {
    if (!signingKey) {
      const pub = base64urlDecode(cfg.publicKey);
      signingKey = crypto.subtle.importKey(
        'jwk',
        { kty: 'EC', crv: 'P-256', d: cfg.privateKey, x: base64url(pub.slice(1, 33)), y: base64url(pub.slice(33, 65)), ext: true },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      );
    }
    return signingKey;
  };

  const vapidHeader = async (endpoint: string) => {
    const enc = (o: object) => base64url(te.encode(JSON.stringify(o)));
    const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({
      aud: new URL(endpoint).origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: cfg.subject,
    })}`;
    // WebCrypto ECDSA 서명은 JWS(ES256)가 요구하는 r||s 형식 그대로다
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await getSigningKey(), te.encode(unsigned));
    return `vapid t=${unsigned}.${base64url(new Uint8Array(sig))}, k=${cfg.publicKey}`;
  };

  return {
    async send(target, payload) {
      const body = await encryptPayload(target, te.encode(payload));
      const res = await fetch(target.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapidHeader(target.endpoint),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(24 * 60 * 60),
          Urgency: 'normal',
        },
        body,
      });
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        console.warn('web push failed', res.status, await res.text().catch(() => ''));
      }
      return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
    },
  };
}
