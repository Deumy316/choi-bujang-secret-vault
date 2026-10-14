import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';
import { createLoginVerifier } from '../src/verify-login.mjs';

const ISSUER = 'https://judge-fixture.example.org/defense/judge';
const AUDIENCE = 'student-defense.vercel.app';
const SUBJECT = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const config = {
  judgeIssuer: ISSUER,
  publicAppUrl: `https://${AUDIENCE}`,
  identityProvider: {
    issuer: 'https://student-fixture.example.org/auth/v1',
    jwksUrl: 'https://student-fixture.example.org/auth/v1/.well-known/jwks.json',
    audience: 'authenticated',
  },
};

async function fixture() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'judge-fixture-key';
  const verifier = createLoginVerifier({
    config,
    judgeKeySet: createLocalJWKSet({ keys: [jwk] }),
    supabaseClient: { auth: { getClaims: async () => ({ data: null, error: new Error('unused') }) } },
  });
  async function token(overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      aleph_run: RUN,
      aleph_role: 'judge',
      aleph_identity: 'b',
      ...overrides,
    })
      .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
      .setSubject(SUBJECT)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey);
  }
  return { verifier, token };
}

test('검증된 judge B JWT의 sub를 복원 소유자 userId로 사용한다', async () => {
  const { verifier, token } = await fixture();
  assert.deepEqual(await verifier(`Bearer ${await token()}`), {
    kind: 'judge',
    userId: SUBJECT,
    runId: RUN,
    identity: 'b',
  });
});

test('잘못된 role·identity·서명은 judge 로그인으로 인정하지 않는다', async () => {
  const { verifier, token } = await fixture();
  assert.equal(await verifier(`Bearer ${await token({ aleph_role: 'student' })}`), null);
  assert.equal(await verifier(`Bearer ${await token({ aleph_identity: 'c' })}`), null);
  const valid = await token();
  const forged = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(await verifier(`Bearer ${forged}`), null);
});
