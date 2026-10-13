import { RESOURCE_TYPES } from './resource-id.mjs';

export function isOwner(note, userId) {
  return note?.owner_id === userId;
}

export function onlyOwnedNotes(notes, userId) {
  return notes.filter(note => isOwner(note, userId));
}

export function isInstructorNoticeResourceId(resourceId) {
  return typeof resourceId === 'string'
    && resourceId.startsWith(`vault:${RESOURCE_TYPES.INSTRUCTOR_NOTICE}:`);
}
