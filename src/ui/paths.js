// @ts-check
// VFS path helpers for apps (they can't import services/): resolving what a user typed
// ("~/x", "../y", relative to a folder), parent folders and joining.

/**
 * Resolves a typed path: absolute, "~", "~/x", or relative to `cwd`. "." and ".." are folded,
 * "\" counts as "/" and ".." never goes above "/".
 * @param {string} input
 * @param {string} cwd absolute folder
 * @param {string} home absolute home folder
 */
export function resolvePath(input, cwd, home) {
  let raw = input.trim().replace(/\\/g, '/');
  if (raw === '' || raw === '.') return cwd;
  if (raw === '~') raw = home;
  else if (raw.startsWith('~/')) raw = home + raw.slice(1);
  else if (!raw.startsWith('/')) raw = `${cwd === '/' ? '' : cwd}/${raw}`;
  /** @type {string[]} */
  const out = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}

/** Parent folder ('/' stays '/'). @param {string} path */
export function parentOf(path) {
  if (path === '/') return '/';
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

/** Last path segment. @param {string} path */
export const baseName = (path) => path.slice(path.lastIndexOf('/') + 1);

/** @param {string} dir @param {string} name */
export const joinPath = (dir, name) => (dir === '/' ? `/${name}` : `${dir}/${name}`);

/** "~/Documents" for paths in the home folder. @param {string} path @param {string} home */
export function tildePath(path, home) {
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
