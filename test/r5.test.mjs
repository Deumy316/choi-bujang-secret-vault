import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 10,
  repoUrl: 'https://github.com/student-a/aleph-defense',
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
const stage12Config = {
  ...config,
  step: 12,
  allowedRoutes: [
    ...config.allowedRoutes,
    'GET /api/device/status',
    'POST /api/device/request',
    'POST /api/device/unregister',
    'POST /api/device/admin',
    'GET /api/operations/status',
  ],
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

test('current attack checks validate three GET responses and leave unexecuted checks not_run', async () => {
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
          step: stage12Config.step,
          repoUrl: stage12Config.repoUrl,
          publicAppUrl: stage12Config.publicAppUrl,
          commit: 'b'.repeat(40),
        });
      }
      return Response.json({ error: 'unexpected request' }, { status: 500 });
    };

    const results = await runAttackChecks(stage12Config);
    assert.deepEqual(requests.map(request => request.url), [
      'https://student-defense.vercel.app/data.json',
      'https://student-defense.vercel.app/api/notes',
      'https://student-defense.vercel.app/aleph.json',
    ]);
    assert.equal(requests.every(request => request.init.method === 'GET'
      && request.init.redirect === 'error'), true);
    assert.equal(results.length, 6);
    assert.deepEqual(results.map(result => result.observed), [
      'HTTP 200', 'HTTP 401', 'HTTP 200', 'not_run', 'not_run', 'not_run',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('current attack checks reject exposed notes and invalid denial or identity responses', async () => {
  const originalFetch = globalThis.fetch;
  const responses = {
    data: () => Response.json({ notes: [] }),
    notes: () => Response.json({ error: 'Login required' }, { status: 401 }),
    identity: () => Response.json({
      step: 12,
      repoUrl: stage12Config.repoUrl,
      publicAppUrl: stage12Config.publicAppUrl,
      commit: 'b'.repeat(40),
    }),
  };
  try {
    globalThis.fetch = async (url) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith('/data.json')) return responses.data();
      if (requestUrl.endsWith('/api/notes')) return responses.notes();
      if (requestUrl.endsWith('/aleph.json')) return responses.identity();
      throw new Error('unexpected request');
    };

    responses.data = () => Response.json({ notes: [{ content: 'hidden' }] });
    await assert.rejects(runAttackChecks(stage12Config), /data\.json 응답 검증/u);

    responses.data = () => Response.json({ notes: [] });
    responses.notes = () => Response.json({ notes: [] }, { status: 401 });
    await assert.rejects(runAttackChecks(stage12Config), /계약대로 거부/u);

    responses.notes = () => Response.json({ error: 'Login required' }, { status: 401 });
    const validIdentity = {
      step: 11,
      repoUrl: stage12Config.repoUrl,
      publicAppUrl: stage12Config.publicAppUrl,
      commit: 'b'.repeat(40),
    };
    for (const invalidIdentity of [
      validIdentity,
      { ...validIdentity, step: 12, repoUrl: 'https://github.com/student-b/other' },
      { ...validIdentity, step: 12, publicAppUrl: 'https://other.vercel.app' },
      { ...validIdentity, step: 12, commit: 'short' },
    ]) {
      responses.identity = () => Response.json(invalidIdentity);
      await assert.rejects(runAttackChecks(stage12Config), /배포 식별 정보 검증/u);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
