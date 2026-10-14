import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_TARGETS = Object.freeze(['src/decider.mjs']);
const BACKUP_TARGETS = Object.freeze({ 'src/decider.mjs': 'backups/policy/decider.mjs' });
const MAX_BACKUP_BYTES = 1024 * 1024;
const MAX_POLICY_BYTES = 256 * 1024;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizePolicy(value) {
  return value.replace(/\r\n/gu, '\n');
}

function fail(message) {
  throw new Error(message);
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function backupDigest(backup) {
  return sha256(canonicalJson({
    schema: backup.schema,
    version: backup.version,
    createdAt: backup.createdAt,
    sourceCommit: backup.sourceCommit,
    files: backup.files,
    verification: {
      status: backup.verification?.status,
      scope: backup.verification?.scope,
      verifiedAt: backup.verification?.verifiedAt,
      checks: backup.verification?.checks,
      notRun: backup.verification?.notRun,
    },
  }));
}

export function comparePolicyBackup(backup, currentFiles, backupFiles, commitExists = () => true) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) fail('정책 백업 형식이 올바르지 않습니다.');
  if (backup.schema !== 'aleph.policy-backup.v1') fail('지원하지 않는 정책 백업 형식입니다.');
  if (typeof backup.version !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/u.test(backup.version)) fail('백업 버전이 올바르지 않습니다.');
  if (!validDate(backup.createdAt)) fail('백업 생성 시점이 올바르지 않습니다.');
  if (typeof backup.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/u.test(backup.sourceCommit)) fail('백업 원본 커밋이 올바르지 않습니다.');
  if (!commitExists(backup.sourceCommit)) fail('백업 원본 커밋을 현재 저장소에서 확인할 수 없습니다.');
  if (!Array.isArray(backup.files) || backup.files.length !== POLICY_TARGETS.length) fail('백업 정책 대상 범위가 올바르지 않습니다.');

  const files = new Map();
  for (const file of backup.files) {
    if (!file || typeof file !== 'object' || !POLICY_TARGETS.includes(file.path)
        || file.backupPath !== BACKUP_TARGETS[file.path]
        || !Number.isInteger(file.byteLength) || file.byteLength < 1
        || typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(file.sha256)
        || files.has(file.path)) {
      fail('백업 정책 파일의 경로, 크기 또는 해시가 올바르지 않습니다.');
    }
    const content = backupFiles[file.path];
    if (typeof content !== 'string' || content.includes('\r')
        || Buffer.byteLength(content, 'utf8') !== file.byteLength || file.byteLength > MAX_POLICY_BYTES
        || sha256(content) !== file.sha256) {
      fail('정책 파일 사본의 LF 바이트 해시가 메타데이터와 일치하지 않습니다.');
    }
    files.set(file.path, file);
  }
  if (POLICY_TARGETS.some(path => !files.has(path))) fail('필수 정책 파일이 백업에 없습니다.');

  const digest = backupDigest(backup);
  if (backup.integrity?.algorithm !== 'sha256' || backup.integrity.sha256 !== digest) {
    fail('정책 백업 무결성 해시가 일치하지 않습니다.');
  }
  const verification = backup.verification;
  if (verification?.status !== 'passed' || verification.scope !== 'local_only'
      || verification.backupSha256 !== digest
      || !validDate(verification.verifiedAt) || Date.parse(verification.verifiedAt) < Date.parse(backup.createdAt)
      || !Array.isArray(verification.checks)
      || !['decider:test', 'ownership-resource:test'].every(name => verification.checks.some(check => check?.name === name
        && check.passed === true && Number.isInteger(check.passedCount) && check.passedCount > 0
        && check.passedCount === check.totalCount))
      || verification.checks.some(check => typeof check?.name !== 'string' || check.passed !== true)
      || !Array.isArray(verification.notRun)
      || !verification.notRun.some(check => check?.name === 'database-http-integration' && check.status === 'not_run')) {
    fail('정책 백업의 검증 근거가 없거나 무결성 해시와 일치하지 않습니다.');
  }

  const changes = POLICY_TARGETS.map(path => {
    const current = currentFiles[path];
    if (typeof current !== 'string') fail(`현재 정책 파일을 읽을 수 없습니다: ${path}`);
    const normalizedCurrent = normalizePolicy(current);
    return {
      target: path,
      currentSha256: sha256(normalizedCurrent),
      restoreSha256: files.get(path).sha256,
      changed: normalizedCurrent !== backupFiles[path],
    };
  });
  return {
    version: backup.version,
    createdAt: backup.createdAt,
    integritySha256: digest,
    verificationChecks: verification.checks.map(check => check.name),
    changes,
  };
}

export function policyCommitExists(root, commit) {
  const checked = spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: root, stdio: 'ignore' });
  return checked.status === 0;
}

export function loadPolicyBaseline(root = ROOT) {
  const metadataPath = join(root, 'backups', 'policy', 'verified-policy.json');
  if (!existsSync(metadataPath)) fail(`검증된 정책 백업이 없습니다: ${relative(root, metadataPath)}`);
  const raw = readFileSync(metadataPath, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_BACKUP_BYTES) fail('정책 백업 파일이 허용 크기를 초과했습니다.');
  const backup = JSON.parse(raw);
  const backupFiles = Object.fromEntries(POLICY_TARGETS.map(path => {
    const backupFile = join(root, BACKUP_TARGETS[path]);
    if (!existsSync(backupFile)) fail(`정책 파일 사본이 없습니다: ${BACKUP_TARGETS[path]}`);
    return [path, readFileSync(backupFile, 'utf8')];
  }));
  return { backup, backupFiles };
}

function main() {
  const { backup, backupFiles } = loadPolicyBaseline();
  const currentFiles = Object.fromEntries(POLICY_TARGETS.map(path => [path, readFileSync(join(ROOT, path), 'utf8')]));
  const result = comparePolicyBackup(backup, currentFiles, backupFiles,
    commit => policyCommitExists(ROOT, commit));

  process.stdout.write(`복원 대상 버전: ${result.version}\n생성 시점: ${result.createdAt}\n무결성 SHA-256: ${result.integritySha256}\n검증 근거: ${result.verificationChecks.join(', ')}\n`);
  for (const change of result.changes) {
    process.stdout.write(`변경 대상: ${change.target}\n기존 값(SHA-256): ${change.currentSha256}\n복원 예정 값(SHA-256): ${change.restoreSha256}\n변경 여부: ${change.changed ? '변경 예정' : '변경 없음'}\n`);
  }
  process.stdout.write('비교만 완료했습니다. 정책 복원은 실행하지 않았습니다.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`정책 백업 비교 중단: ${error.message}\n`);
    process.exitCode = 1;
  }
}
