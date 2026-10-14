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
  allowedRoutes: ['POST /api/notes/restore'],
  restoreRoute: '/api/notes/restore',
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('build identity uses current Vercel Git and deployment metadata', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 10,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    allowedRoutes: config.allowedRoutes,
    originalApiUrl: config.originalApiUrl,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
});

test('current attack checks use public endpoints without credentials', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
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
          publicAppUrl: config.publicAppUrl,
        });
      }
      if (requestUrl.endsWith('/api/notes/restore')) {
        return Response.json({ error: 'Login required' }, { status: 401 });
      }
      return Response.json({ error: 'unexpected request' }, { status: 500 });
    };

    const results = await runAttackChecks(config);
    assert.deepEqual(requests.map(request => request.url), [
      'https://student-defense.vercel.app/data.json',
      'https://student-defense.vercel.app/api/notes',
      'https://student-defense.vercel.app/aleph.json',
      'https://student-defense.vercel.app/api/notes/restore',
    ]);
    assert.equal(requests.every(request => request.init.redirect === 'error'), true);
    assert.equal(results.length, 6);
    assert.match(results[0].observed, /확인되지 않음/u);
    assert.match(results[1].observed, /차단됨/u);
    assert.match(results[2].observed, /10단계/u);
    assert.match(results[5].observed, /HTTP 401/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
