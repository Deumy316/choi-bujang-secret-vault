import { readFileSync } from 'node:fs';
import { comparePolicyBackup } from '../scripts/compare-policy-backup.mjs';
import { listVerificationChecks, officialAttackSuite } from './operations-verification.mjs';

const METADATA_URL = new URL('../backups/policy/verified-policy.json', import.meta.url);
const BACKUP_URL = new URL('../backups/policy/decider.mjs', import.meta.url);
const CURRENT_URL = new URL('./decider.mjs', import.meta.url);
const DEVICE_STATES = new Set(['pending', 'approved', 'rejected', 'revoked', 'expired', 'unknown']);

export function readBundledPolicyStatus() {
  try {
    const backup = JSON.parse(readFileSync(METADATA_URL, 'utf8'));
    const backupPolicy = readFileSync(BACKUP_URL, 'utf8');
    const currentPolicy = readFileSync(CURRENT_URL, 'utf8');
    const result = comparePolicyBackup(
      backup,
      { 'src/decider.mjs': currentPolicy },
      { 'src/decider.mjs': backupPolicy },
      () => true,
    );
    return Object.freeze({
      status: 'verified_local',
      version: result.version,
      application: result.changes[0].changed ? 'differs' : 'matches_current_bundle',
      sourceCommitCheck: 'not_run_at_runtime',
    });
  } catch {
    return Object.freeze({
      status: 'verification_failed',
      version: null,
      application: 'unknown',
      sourceCommitCheck: 'not_run_at_runtime',
    });
  }
}

export function buildOperationsStatus({ deviceStatus, policyStatus, checkedAt, restoreRoute }) {
  const safeDeviceStatus = DEVICE_STATES.has(deviceStatus) ? deviceStatus : 'unknown';
  const policy = policyStatus?.status ? policyStatus : {
    status: 'verification_failed', version: null, application: 'unknown',
    sourceCommitCheck: 'not_run_at_runtime',
  };
  return Object.freeze({
    schema: 'aleph.operations.status.v1',
    checkedAt,
    attackSuite: officialAttackSuite,
    verification: {
      schema: 'aleph.operations.verification.v1',
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
