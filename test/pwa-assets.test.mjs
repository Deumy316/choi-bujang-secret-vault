import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('PWA 설정은 공개 셸만 캐시하고 기기 상태를 임의 승인하지 않는다', async () => {
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
  const html = await readFile('public/index.html', 'utf8');
  const worker = await readFile('public/sw.js', 'utf8');

  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length > 0);
  assert.match(html, /showDeviceApproval\('unknown'\)/u);
  assert.match(html, /authenticatedFetch\('\/api\/device\/admin'/u);
  assert.match(html, /showDeviceApproval\(result\.status, result\.registrationId\)/u);
  assert.match(html, /현재 요청 ID/u);
  assert.match(html, /BYTE BACK · 탈환 작전실/u);
  assert.match(html, /authenticatedFetch\('\/api\/operations\/status'/u);
  assert.match(html, /1~11단계 통합 검증표/u);
  assert.match(html, /verificationStageFilter/u);
  assert.doesNotMatch(html, /BYTE BACK · 5단계/u);
  assert.doesNotMatch(html, /(?:localStorage|sessionStorage)\.setItem/u);
  assert.doesNotMatch(worker, /\/api\//u);
  assert.doesNotMatch(worker, /data\.json/u);
});
