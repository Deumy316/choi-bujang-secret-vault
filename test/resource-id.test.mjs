import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResourceId, RESOURCE_TYPES } from '../src/resource-id.mjs';

test('notes and instructor notices have separate resource ids', () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';

  assert.equal(createResourceId(RESOURCE_TYPES.NOTE, id), `vault:note:${id}`);
  assert.equal(
    createResourceId(RESOURCE_TYPES.INSTRUCTOR_NOTICE, id),
    `vault:instructor-notice:${id}`,
  );
  assert.notEqual(
    createResourceId(RESOURCE_TYPES.NOTE, id),
    createResourceId(RESOURCE_TYPES.INSTRUCTOR_NOTICE, id),
  );
});
