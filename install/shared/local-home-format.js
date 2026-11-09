export const HOME_LIMIT = 64 * 1024 * 1024;
export const HOME_VERSION = 1;
export const HOME_ID = /^[a-z0-9-]{16,64}$/i;

export function homeKey(key) {
  return key === 'dsh-room.last' || key === 'dsh-room.prefs' || key === 'dsh-room.group'
    || /^dsh-room\.scene\.[^\u0000-\u001f]{1,160}$/.test(key);
}

export function homeKeys(input) {
  return Object.fromEntries(Object.entries(input || {}).filter(([key, value]) => homeKey(key) && typeof value === 'string'));
}

export function emptyHome() { return { version: HOME_VERSION, keys: {}, packs: [], drafts: [] }; }
