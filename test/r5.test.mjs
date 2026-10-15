import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 10,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
  originalApiUrl: 'https://student-project.supabase.co/rest/v1/notes',
  identityProvider: {
    issuer: 'https://student-project.supabase.co/auth/v1',
    jwksUrl: 'https://student-project.supabase.co/auth/v1/.well-known/jwks.json',
    audience: 'authenticated',
  },
  allowedRoutes: ['POST /api/restore/:noteId'],
  restoreRoute: '/api/restore/:noteId',
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('build identity uses current Vercel Git metadata and canonical app URL', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 10,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: config.publicAppUrl,
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    allowedRoutes: config.allowedRoutes,
    identityProvider: config.identityProvider,
    originalApiUrl: config.originalApiUrl,
    restoreRoute: config.restoreRoute,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
  assert.throws(() => deploymentIdentity(env, { ...config, publicAppUrl: 'https://wrong.example' }));
  assert.throws(() => deploymentIdentity(env, { ...config, restoreRoute: '/wrong' }));
});

test('current attack checks use public endpoints without credentials', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let identityPublicAppUrl = config.publicAppUrl;
  try {
    globalThis.fetch = async (url, init) => {
      const requestUrl = String(url);
      requests.push({ url: requestUrl, init });
      if (requestUrl.endsWith('/data.json')) return Response.json({ notes: [] });
      if (requestUrl.endsWith('/api/notes')) {
        return Response.json({ error: 'Login required' }, { status: 401 });
      }
      if (requestUrl.endsWith('/aleph.json')) {
        return Response.json({
          step: 10,
          repoUrl: 'https://github.com/student-a/aleph-defense',
          publicAppUrl: identityPublicAppUrl,
        });
      }
      if (requestUrl.endsWith('/api/restore/00000000-0000-4000-8000-000000000000')) {
        return Response.json({ error: 'Login required' }, { status: 401 });
      }
      return Response.json({ error: 'unexpected request' }, { status: 500 });
    };

    const results = await runAttackChecks(config);
    assert.deepEqual(requests.map(request => request.url), [
      'https://student-defense.vercel.app/data.json',
      'https://student-defense.vercel.app/api/notes',
      'https://student-defense.vercel.app/aleph.json',
      'https://student-defense.vercel.app/api/restore/00000000-0000-4000-8000-000000000000',
    ]);
    assert.equal(requests.every(request => request.init.redirect === 'error'), true);
    assert.equal(results.length, 6);
    assert.match(results[0].observed, /확인되지 않음/u);
    assert.match(results[1].observed, /차단됨/u);
    assert.match(results[2].observed, /10단계/u);
    assert.match(results[5].observed, /HTTP 401/u);

    identityPublicAppUrl = 'https://different-deployment.vercel.app';
    const mismatchedIdentityResults = await runAttackChecks(config);
    assert.match(mismatchedIdentityResults[2].observed, /확인하지 못함/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
