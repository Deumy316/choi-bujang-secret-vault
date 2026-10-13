export const RESOURCE_TYPES = Object.freeze({
  NOTE: 'note',
  INSTRUCTOR_NOTICE: 'instructor-notice',
});

export function createResourceId(type, id) {
  return `vault:${type}:${id}`;
}
