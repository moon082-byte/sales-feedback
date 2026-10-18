// Web Push용 VAPID 키쌍 생성
//   npm run gen-vapid
// 출력된 VAPID_PUBLIC_KEY 는 wrangler.toml [vars] 에, VAPID_PRIVATE_KEY 는 `wrangler secret put VAPID_PRIVATE_KEY` 로 등록
const { subtle } = globalThis.crypto;
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
const jwk = await subtle.exportKey('jwk', pair.privateKey);
const b64url = (b) => Buffer.from(b).toString('base64url');

console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
