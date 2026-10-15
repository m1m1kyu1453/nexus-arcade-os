// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createDialogs } from '../../src/shell/dialogs/dialogs.js';
import { createMemoryEngine } from '../../src/services/storage/engine-memory.js';
import { THEMES } from '../../src/services/theme/themes.js';
import { createVfs, VFS_STORE_SCHEMA } from '../../src/services/vfs/vfs.js';

async function setup() {
  const db = await createMemoryEngine().open('profile', VFS_STORE_SCHEMA);
  const vfs = createVfs({ db, bus: createEventBus(), user: 'ada' });
  await vfs.init();
  await vfs.writeFile('/home/ada/Documents/a.txt', 'A');
  await vfs.writeFile('/home/ada/Documents/b.md', 'B');
  await vfs.mkdir('/home/ada/Documents/Sub');
  const manifests = { 'x.one': { id: 'x.one', icon: 'file' }, 'x.two': { id: 'x.two', icon: 'code' } };
  const system = {
    vfs,
    theme: { token: () => '#112233', themes: () => THEMES },
    i18n: { format: { bytes: (/** @type {number} */ n) => `${n} B` } },
    registry: { get: (/** @type {string} */ id) => manifests[/** @type {'x.one'} */ (id)] },
    localize: (/** @type {any} */ v) => v,
  };
  const shell = /** @type {any} */ ({ system: () => system, t: (/** @type {string} */ key) => key });
  return { vfs, dialogs: createDialogs(shell) };
}

const modal = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[role="dialog"]')]).at(-1);
/** @param {string} selector */
const find = (selector) => /** @type {HTMLInputElement} */ (modal()?.querySelector(selector));
const flush = () => new Promise((r) => setTimeout(r, 0));
/** @param {string} label */
const button = (label) =>
  /** @type {HTMLButtonElement} */ (
    [...(modal()?.querySelectorAll('.nx-modal-actions button') ?? [])].find((b) => b.textContent === label)
  );
/** @param {() => unknown} check */
async function until(check) {
  for (let i = 0; i < 100 && !check(); i++) await flush();
}
const fileNames = () => [...(modal()?.querySelectorAll('.nx-dlg-name') ?? [])].map((s) => s.textContent);

afterEach(() => document.body.replaceChildren());

describe('system dialogs', () => {
  it('confirm resolves true on OK and false on Escape', async () => {
    const { dialogs } = await setup();
    const yes = dialogs.confirm('Sure?');
    button('dialog.ok').click();
    expect(await yes).toBe(true);

    const no = dialogs.confirm('Sure?');
    modal()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await no).toBe(false);
  });

  it('prompt returns the typed value, or null when cancelled', async () => {
    const { dialogs } = await setup();
    const answer = dialogs.prompt('Name?', 'old');
    const input = find('input');
    expect(input.value).toBe('old');
    input.value = 'new';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(await answer).toBe('new');

    const cancelled = dialogs.prompt('Name?');
    button('dialog.cancel').click();
    expect(await cancelled).toBeNull();
  });

  it('openFile lists the folder (filtered by accept) and returns the selected path', async () => {
    const { dialogs } = await setup();
    const result = dialogs.openFile({ accept: ['.txt'] });
    await until(() => fileNames().length);
    expect(fileNames()).toEqual(['Sub', 'a.txt']);

    // Open without a selection keeps the dialog open.
    button('dialog.open').click();
    await flush();
    expect(modal()).toBeTruthy();

    find('[data-path$="a.txt"]').click();
    button('dialog.open').click();
    expect(await result).toBe('/home/ada/Documents/a.txt');
  });

  it('openFile navigates into folders and through places', async () => {
    const { dialogs, vfs } = await setup();
    await vfs.writeFile('/home/ada/Pictures/p.png', new Uint8Array([1]));
    const result = dialogs.openFile();
    await until(() => fileNames().length);
    find('[data-path$="Sub"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => modal()?.querySelector('.nx-empty'));
    expect(modal()?.querySelector('.nx-empty')?.textContent).toBe('dialog.emptyFolder');

    const pictures = [...(modal()?.querySelectorAll('.nx-dlg-place') ?? [])].find((b) =>
      b.textContent?.includes('dialog.place.pictures'),
    );
    /** @type {HTMLElement} */ (pictures).click();
    await until(() => fileNames().includes('p.png'));
    find('[data-path$="p.png"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(await result).toBe('/home/ada/Pictures/p.png');
  });

  it('saveFile asks before replacing; declining keeps the browser open', async () => {
    const { dialogs } = await setup();
    const result = dialogs.saveFile({ suggestedName: 'a.txt' });
    await until(() => fileNames().length);
    const outer = modal();
    button('dialog.save').click();
    await until(() => modal() !== outer);
    expect(modal()?.textContent).toContain('dialog.overwrite');
    button('dialog.cancel').click();
    await until(() => modal() === outer);
    expect(document.body.contains(/** @type {Node} */ (outer))).toBe(true);

    const name = /** @type {HTMLInputElement} */ (outer?.querySelector('.nx-field input'));
    name.value = 'c.txt';
    button('dialog.save').click();
    expect(await result).toBe('/home/ada/Documents/c.txt');
  });

  it('color returns the hex value; pickApp returns the choice and "always"', async () => {
    const { dialogs } = await setup();
    const color = dialogs.color();
    const hex = find('input.nx-input');
    expect(hex.value).toBe('#112233');
    hex.value = '#ABCDEF';
    hex.dispatchEvent(new Event('input'));
    button('dialog.ok').click();
    expect(await color).toBe('#abcdef');

    const pick = dialogs.pickApp({
      candidates: [
        { id: 'x.one', name: 'One' },
        { id: 'x.two', name: 'Two' },
      ],
    });
    const radios = /** @type {HTMLInputElement[]} */ ([...(modal()?.querySelectorAll('input[type="radio"]') ?? [])]);
    radios[1].click();
    find('.nx-dlg-always input').click();
    button('dialog.ok').click();
    expect(await pick).toEqual({ appId: 'x.two', always: true });
  });
});
