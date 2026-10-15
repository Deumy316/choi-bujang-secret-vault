import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { backupDigest } from '../scripts/compare-policy-backup.mjs';
import {
  bundleSelfCheck,
  listVerificationChecks,
  officialAttackSuite,
  regressionPlan,
} from './operations-verification.mjs';

const METADATA_URL = new URL('../backups/policy/verified-policy.json', import.meta.url);
const BACKUP_URL = new URL('../backups/policy/decider.mjs', import.meta.url);
const CURRENT_URL = new URL('./decider.mjs', import.meta.url);
const DEVICE_STATES = new Set(['pending', 'approved', 'rejected', 'revoked', 'expired', 'unknown']);

export function readBundledPolicyStatus() {
  try {
    const backup = JSON.parse(readFileSync(METADATA_URL, 'utf8'));
    const backupPolicy = readFileSync(BACKUP_URL, 'utf8');
    const currentPolicy = readFileSync(CURRENT_URL, 'utf8');
    const file = backup.files?.find(item => item?.path === 'src/decider.mjs'
      && item.backupPath === 'backups/policy/decider.mjs');
    const fileSha256 = createHash('sha256').update(backupPolicy, 'utf8').digest('hex');
    const integritySha256 = backupDigest(backup);
    const fileHashVerified = file
      && !backupPolicy.includes('\r')
      && Buffer.byteLength(backupPolicy, 'utf8') === file.byteLength
      && fileSha256 === file.sha256
      && backup.integrity?.algorithm === 'sha256'
      && backup.integrity.sha256 === integritySha256
      && backup.verification?.status === 'passed'
      && backup.verification.backupSha256 === integritySha256;
    if (!fileHashVerified) throw new Error('policy_backup_hash_mismatch');

    const currentSha256 = createHash('sha256')
      .update(currentPolicy.replace(/\r\n/gu, '\n'), 'utf8').digest('hex');
    const fileHashCheck = currentSha256 === file.sha256 ? 'matches' : 'differs';
    return Object.freeze({
      status: 'verification_incomplete',
      version: backup.version,
      fileHashCheck,
      application: fileHashCheck === 'matches' ? 'matches_current_bundle' : 'differs',
      sourceCommitCheck: 'unverifiable',
      runtimeApplication: 'not_observed',
    });
  } catch {
    return Object.freeze({
      status: 'verification_failed',
      version: null,
      fileHashCheck: 'failed',
      application: 'unknown',
      sourceCommitCheck: 'unverifiable',
      runtimeApplication: 'not_observed',
    });
  }
}

export function buildOperationsStatus({ deviceStatus, policyStatus, checkedAt, restoreRoute }) {
  const safeDeviceStatus = DEVICE_STATES.has(deviceStatus) ? deviceStatus : 'unknown';
  const policy = policyStatus?.status ? policyStatus : {
    status: 'verification_failed', version: null, fileHashCheck: 'failed',
    application: 'unknown', sourceCommitCheck: 'unverifiable',
    runtimeApplication: 'not_observed',
  };
  return Object.freeze({
    schema: 'aleph.operations.status.v1',
    checkedAt,
    attackSuite: officialAttackSuite,
    bundleSelfCheck,
    verification: {
      schema: 'aleph.operations.verification.v1',
      plan: regressionPlan,
      checks: listVerificationChecks(),
    },
    decision: {
      device: { status: safeDeviceStatus, source: 'authenticated_server_record' },
      stepUp: { status: 'not_run', source: 'no_current_request_evidence' },
      zoneAccess: { status: 'not_run', source: 'no_current_request_evidence' },
      policy,
    },
    detection: {
      unusualAccess: { status: 'not_run' },
      burstRead: { status: 'not_run' },
      xdrEventCount: null,
      xdrWarningCount: null,
      lastCheckedAt: null,
    },
    revocation: {
      device: { status: safeDeviceStatus },
      identity: { status: 'unknown' },
      proposal: { status: 'not_run' },
      enforcement: { status: safeDeviceStatus === 'revoked' ? 'applied' : 'not_observed' },
    },
    recovery: {
      policyBackup: policy,
      noteRestore: {
        status: restoreRoute === '/api/restore/:noteId'
          ? 'configured_not_measured' : 'unknown',
      },
      lastMeasuredAt: null,
    },
  });
}
