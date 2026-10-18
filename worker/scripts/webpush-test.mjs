// lib/webpush.ts 검증: 독립 구현(http_ece)으로 복호화되는지, VAPID JWT 서명이 유효한지
//   node ./scripts/webpush-test.mjs
import { build } from 'esbuild';
import { createECDH, createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ece from 'http_ece';

const dir = mkdtempSync(join(tmpdir(), 'webpush-test-'));
try {
  const out = join(dir, 'webpush.mjs');
  await build({ entryPoints: ['src/lib/webpush.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error' });
  const { encryptPayload, createWebPushSender } = await import(pathToFileURL(out).href);

  // 1) 브라우저(수신자) 키 생성 → 암호화 → http_ece 로 복호화
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const target = { p256dh: ua.getPublicKey().toString('base64url'), auth: Buffer.from(auth).toString('base64url') };
  const message = JSON.stringify({ title: '새 영업 평가', body: '테스트 메시지 🔔' });
  const body = await encryptPayload(target, new TextEncoder().encode(message));
  const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret: target.auth });
  assert.equal(plain.toString('utf8'), message);
  console.log('✓ aes128gcm 암호문을 http_ece 가 복호화');

  // 2) VAPID 헤더: 키 생성 → 발송(fetch 가로채기) → JWT 서명 검증
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const d = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response('', { status: 201 });
  };
  const sender = createWebPushSender({ publicKey: pub, privateKey: d, subject: 'mailto:test@example.com' });
  const res = await sender.send({ endpoint: 'https://push.example.com/abc', ...target }, message);
  assert.equal(res.ok, true);

  const m = /^vapid t=([^,]+), k=(.+)$/.exec(captured.init.headers.Authorization);
  assert.ok(m, 'Authorization 형식');
  assert.equal(m[2], pub);
  const [h, p, s] = m[1].split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.equal(claims.aud, 'https://push.example.com');
  assert.equal(claims.sub, 'mailto:test@example.com');
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  assert.equal(ok, true);
  assert.equal(captured.init.headers['Content-Encoding'], 'aes128gcm');
  const sent = ece.decrypt(Buffer.from(captured.init.body), { version: 'aes128gcm', privateKey: ua, authSecret: target.auth });
  assert.equal(sent.toString('utf8'), message);
  console.log('✓ VAPID JWT(ES256) 서명 검증, 발송 본문 복호화');

  console.log('\nALL PASSED');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
