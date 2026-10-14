import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function backupHashes({ noteId, ownerId, title, content }) {
  const titleSha256 = sha256(title);
  const contentSha256 = sha256(content);
  return {
    titleSha256,
    contentSha256,
    recordSha256: sha256(`${noteId.toLowerCase()}\n${ownerId.toLowerCase()}\n${titleSha256}\n${contentSha256}`),
  };
}

test('PostgreSQL 복원 백업과 같은 UTF-8 SHA-256 규격을 사용한다', () => {
  assert.deepEqual(backupHashes({
    noteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ownerId: '22222222-2222-4222-8222-222222222222',
    title: '복원 제목',
    content: '검증된 가상 백업 본문',
  }), {
    titleSha256: '9241008a9277e449a20876dbc99703f8aa8b4737421fffe5dcd47df19069483e',
    contentSha256: 'ae4c18d46eed9bb7992f3f9c27b453229894be39b0560dc675b9563a94bd3268',
    recordSha256: '465a2c69f0bdc736698b5b9e4d8be2d3f54c2181dbe49511bc84f28bff574f6e',
  });
});
