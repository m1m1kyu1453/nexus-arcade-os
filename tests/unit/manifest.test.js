import { describe, expect, it } from 'vitest';
import { ManifestError, validateManifest } from '../../src/kernel/manifest.js';
import { testManifest } from '../helpers/manifests.js';

const L = (en, de = en) => ({ en, de });

describe('manifest validation', () => {
  it('accepts a minimal and a full manifest', () => {
    expect(validateManifest(testManifest())).toEqual([]);
    expect(
      validateManifest(
        testManifest({
          keywords: ['a'],
          window: { width: 800, height: 600, minWidth: 300, minHeight: 200, resizable: true, singleInstance: true },
          permissions: ['vfs', 'notifications'],
          handles: [{ action: 'open', types: ['text/markdown', '.md', 'image/*'] }],
          commands: [{ id: 'test.new', title: L('New'), shortcut: 'Mod+N', when: 'appFocused' }],
          settings: [
            { key: 'autosaveMs', type: 'number', default: 800, min: 200, max: 5000, label: L('Autosave') },
            { key: 'mode', type: 'enum', default: 'a', options: [{ value: 'a', label: L('A') }], label: L('Mode') },
            { key: 'wrap', type: 'boolean', default: true, label: L('Wrap') },
          ],
          widgets: [{ id: 'w', title: L('Widget'), size: [2, 1], load: async () => ({}) }],
          achievements: [{ id: 'first', title: L('First'), description: L('Did it'), goal: 10 }],
          search: async () => ({ default: async () => [] }),
          messages: { en: async () => ({ default: {} }), de: async () => ({ default: {} }) },
          storage: {
            version: 1,
            collections: {
              notes: {
                indexes: { updated: 'updatedAt', pair: ['a', 'b'], tags: { keyPath: 'tags', multiEntry: true } },
              },
            },
            migrations: async () => ({ default: [] }),
          },
        }),
      ),
    ).toEqual([]);
  });

  it('reports every problem with its path', () => {
    const problems = validateManifest({
      id: 'Notes',
      name: { en: 'Notes' },
      version: '1',
      category: 'toys',
      permissions: ['camera'],
      commands: [
        { id: 'a', title: L('A'), run: () => {} },
        { id: 'a', title: L('A') },
      ],
      settings: [{ key: 'x', type: 'enum', default: 'z', options: [{ value: 'y' }], label: L('X') }],
      storage: { version: 1.5, collections: { 'Bad Name': { indexes: { i: '' } } } },
    });
    const paths = problems.map((p) => p.split(':')[0]);
    expect(paths).toEqual(
      expect.arrayContaining([
        'id',
        'name.de',
        'description',
        'version',
        'icon',
        'category',
        'load',
        'permissions[0]',
        'commands[0].run',
        'commands[1].id',
        'settings[0].default',
        'storage.version',
        'storage.collections.Bad Name',
        'storage.collections.Bad Name.indexes.i',
      ]),
    );
  });

  it('checks window sizes, handles, setting defaults and widgets', () => {
    const problems = validateManifest(
      testManifest({
        window: { width: 300, minWidth: 400, resizable: 'yes' },
        handles: [{ action: 'edit', types: ['markdown'] }],
        settings: [
          { key: 'n', type: 'number', default: 1, min: 5, label: L('N') },
          { key: 'b', type: 'boolean', default: 'true', label: L('B') },
        ],
        widgets: [{ id: 'w', title: L('W'), size: [0, 1] }],
        messages: { en: async () => ({}) },
      }),
    );
    expect(problems.map((p) => p.split(':')[0])).toEqual([
      'window.minWidth',
      'window.resizable',
      'handles[0].action',
      'handles[0].types[0]',
      'settings[0].default',
      'settings[1].default',
      'widgets[0].size',
      'widgets[0].load',
      'messages.de',
    ]);
  });

  it('rejects non-objects', () => {
    expect(validateManifest(null)).toEqual(['manifest: must be an object']);
  });

  it('ManifestError lists all problems in its message', () => {
    const error = new ManifestError('x.y', ['id: bad', 'name: bad']);
    expect(error.message).toBe('Invalid manifest "x.y":\n- id: bad\n- name: bad');
    expect(error.problems).toHaveLength(2);
  });
});
