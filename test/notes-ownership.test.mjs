import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isInstructorNoticeResourceId,
  isOwner,
  onlyOwnedNotes,
} from '../src/note-access.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const NOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const note = { note_id: NOTE_ID, owner_id: A };

test('A can access A note', () => {
  assert.equal(isOwner(note, A), true);
});

for (const method of ['GET', 'PUT', 'DELETE']) {
  test(`B cannot ${method} A note`, () => {
    assert.equal(isOwner(note, B), false);
  });
}

test('B list excludes A note', () => {
  const notes = [note, { note_id: B, owner_id: B }];
  assert.deepEqual(onlyOwnedNotes(notes, B), [{ note_id: B, owner_id: B }]);
});

test('student instructor-notice update target is recognized for default denial', () => {
  assert.equal(
    isInstructorNoticeResourceId(`vault:instructor-notice:${NOTE_ID}`),
    true,
  );
  assert.equal(isInstructorNoticeResourceId(NOTE_ID), false);
});
