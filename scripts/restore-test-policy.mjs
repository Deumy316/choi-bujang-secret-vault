import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  comparePolicyBackup,
  loadPolicyBaseline,
  policyCommitExists,
} from './compare-policy-backup.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_POLICY_ROOT = join(ROOT, 'test', 'policy-sandbox');
const TEST_POLICY_PATH = join(TEST_POLICY_ROOT, 'decider.mjs');
const PRODUCTION_POLICY_PATH = join(ROOT, 'src', 'decider.mjs');

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function restoreTestPolicy({
  backup,
  backupFiles,
  targetPath,
  allowedRoot,
  apply = false,
  approval,
  commitExists = () => true,
}) {
  const target = resolve(targetPath);
  const root = resolve(allowedRoot);
  if (target === PRODUCTION_POLICY_PATH || dirname(target) !== root || basename(target) !== 'decider.mjs') {
    fail('복원 대상은 격리된 시험 정책 decider.mjs만 허용됩니다.');
  }

  const current = readFileSync(target, 'utf8');
  const comparison = comparePolicyBackup(backup, { 'src/decider.mjs': current }, backupFiles, commitExists);
  const change = comparison.changes[0];
  if (!apply) return { ...comparison, target, applied: false };
  if (approval !== comparison.version) fail(`복원 승인에는 정확한 기준점 버전이 필요합니다: ${comparison.version}`);
  if (!change.changed) return { ...comparison, target, applied: false };

  const content = backupFiles['src/decider.mjs'];
  const temporary = join(root, `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    if (sha256(readFileSync(temporary, 'utf8')) !== change.restoreSha256) {
      fail('임시 시험 정책의 복원 해시가 일치하지 않습니다.');
    }
    renameSync(temporary, target);
  } catch (error) {
    try { unlinkSync(temporary); } catch {}
    throw error;
  }

  const verified = comparePolicyBackup(backup,
    { 'src/decider.mjs': readFileSync(target, 'utf8') }, backupFiles, commitExists);
  if (verified.changes[0].changed) fail('복원 후 시험 정책 해시가 기준점과 일치하지 않습니다.');
  return { ...verified, target, applied: true };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const approvalArg = [...args].find(arg => arg.startsWith('--approve='));
  const approval = approvalArg?.slice('--approve='.length);
  if ([...args].some(arg => arg !== '--apply' && !arg.startsWith('--approve='))) {
    fail('허용되지 않은 옵션입니다. 기본 미리보기 또는 --apply --approve=<기준점 버전>만 사용하세요.');
  }

  const { backup, backupFiles } = loadPolicyBaseline(ROOT);
  const commitExists = commit => policyCommitExists(ROOT, commit);
  const production = comparePolicyBackup(backup,
    { 'src/decider.mjs': readFileSync(PRODUCTION_POLICY_PATH, 'utf8') }, backupFiles, commitExists);
  const result = restoreTestPolicy({
    backup,
    backupFiles,
    targetPath: TEST_POLICY_PATH,
    allowedRoot: TEST_POLICY_ROOT,
    apply,
    approval,
    commitExists,
  });

  process.stdout.write(`복원 대상 버전: ${result.version}\n변경 파일: test/policy-sandbox/decider.mjs\n현재 운영 정책: ${production.changes[0].changed ? '기준점과 다름(변경하지 않음)' : '변경 없음'}\n시험 정책: ${result.changes[0].changed ? '복원 필요' : '변경 없음'}\n동작: ${result.applied ? '승인된 시험 정책 복원 완료' : apply ? '변경이 없어 복원 생략' : '미리보기만 수행'}\n복원 예정 SHA-256: ${result.changes[0].restoreSha256}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`시험 정책 복원 중단: ${error.message}\n`);
    process.exitCode = 1;
  }
}
