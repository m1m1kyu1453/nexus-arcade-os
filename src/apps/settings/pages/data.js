// @ts-check
// Settings pages about stored data: Storage, Apps (per-app settings and default apps), Privacy.
import { h, icon } from '../../../ui/dom.js';
import { group, infoRow, settingRow } from '../form.js';

/** @param {import('./types.js').PageContext} pc @param {number} bytes */
const size = (pc, bytes) => pc.ctx.i18n.bytes(bytes);

/** @type {import('./types.js').Page} */
export const storage = {
  id: 'storage',
  icon: 'hard-drive',
  keys: ['trashRetentionDays'],
  async render(pc) {
    const { t, system } = pc;
    const [estimate, persistence, usage, quarantine] = await Promise.all([
      system.storage.estimate(),
      system.storage.persistence(),
      system.storage.usage(),
      system.storage.quarantine(),
    ]);
    const ratio = estimate?.quota ? estimate.usage / estimate.quota : 0;
    const home = /** @type {string} */ (pc.ctx.fs.home);
    const folderName = (/** @type {string} */ p) =>
      p === home
        ? '~'
        : p.startsWith(`${home}/`)
          ? `~${p.slice(home.length)}`
          : p === '/.trash'
            ? t('storage.trash')
            : p;
    const appRows = usage.apps.map((a) => {
      const app = system.apps.get(a.id);
      return infoRow(
        app ? pc.local(app.name) : a.id,
        t('storage.records', { size: size(pc, a.bytes), count: a.records }),
        h('button', {
          type: 'button',
          class: 'nx-btn is-danger',
          text: t('storage.clearApp'),
          onclick: async () => {
            const name = app ? pc.local(app.name) : a.id;
            if (
              !(await pc.confirm(t('storage.clearAppConfirm', { app: name }), {
                danger: true,
                okLabel: t('storage.clearApp'),
              }))
            )
              return;
            try {
              await system.apps.clearData(a.id);
              pc.toast(t('storage.clearedApp', { app: name }));
            } catch (e) {
              pc.toast(String(/** @type {Error} */ (e).message));
            }
            pc.refresh();
          },
        }),
      );
    });

    return [
      group(
        t('group.browserStorage'),
        h(
          'div',
          { class: 'nx-set-row is-stack', dataset: { testid: 'storage-overview' } },
          estimate
            ? h(
                'div',
                {
                  class: 'nx-set-meter',
                  role: 'meter',
                  'aria-valuemin': '0',
                  'aria-valuemax': '100',
                  'aria-valuenow': String(Math.round(ratio * 100)),
                  'aria-label': t('storage.used'),
                },
                h('span', { style: { width: `${Math.max(1, ratio * 100)}%` } }),
              )
            : null,
          h('p', {
            text: estimate
              ? t('storage.usedOf', { used: size(pc, estimate.usage), total: size(pc, estimate.quota) })
              : t('storage.noEstimate'),
          }),
          h('p', {
            class: 'nx-set-desc',
            text: t('storage.engine', { engine: t(`storage.engines.${system.storage.engine}`) }),
          }),
        ),
        infoRow(
          t('storage.persistence'),
          t(`storage.persist.${persistence}`),
          persistence === 'best-effort'
            ? h('button', {
                type: 'button',
                class: 'nx-btn',
                text: t('storage.persistAsk'),
                onclick: async () => {
                  const result = await system.storage.requestPersistence();
                  pc.toast(t(`storage.persist.${result}`));
                  pc.refresh();
                },
              })
            : null,
        ),
        infoRow(
          t('storage.caches'),
          t('storage.cachesHint'),
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('storage.clearCaches'),
            onclick: async () => {
              const n = await system.storage.clearCaches();
              pc.toast(t('storage.cachesCleared', { count: n }));
            },
          }),
        ),
      ),
      group(
        t('group.files'),
        ...(usage.folders.length
          ? usage.folders.map((f) =>
              infoRow(
                folderName(f.path),
                size(pc, f.bytes),
                h('button', {
                  type: 'button',
                  class: 'nx-btn is-ghost',
                  text: t('storage.show'),
                  onclick: () => void pc.ctx.intents.open({ path: f.path, type: 'folder', mime: 'inode/directory' }),
                }),
              ),
            )
          : [h('p', { class: 'nx-set-desc', text: t('storage.noFiles') })]),
        pc.row('trashRetentionDays'),
      ),
      group(
        t('group.appData'),
        ...(appRows.length ? appRows : [h('p', { class: 'nx-set-desc', text: t('storage.noAppData') })]),
        infoRow(t('storage.system'), t('storage.systemHint'), h('span', { text: size(pc, usage.system) })),
      ),
      group(
        t('group.quarantine'),
        ...(quarantine.length
          ? quarantine.map((q) =>
              infoRow(
                q.app ? pc.local(system.apps.get(q.app)?.name ?? q.app) : q.store,
                t('storage.quarantined', {
                  reason: q.reason,
                  date: pc.ctx.i18n.date(q.at, { dateStyle: 'medium', timeStyle: 'short' }),
                  size: size(pc, q.bytes),
                }),
                h('button', {
                  type: 'button',
                  class: 'nx-btn is-danger',
                  text: t('storage.discard'),
                  onclick: async () => {
                    if (
                      !(await pc.confirm(t('storage.discardConfirm'), { danger: true, okLabel: t('storage.discard') }))
                    )
                      return;
                    await system.storage.deleteQuarantined(q.id);
                    pc.refresh();
                  },
                }),
              ),
            )
          : [
              h('p', {
                class: 'nx-set-desc',
                dataset: { testid: 'quarantine-empty' },
                text: t('storage.quarantineEmpty'),
              }),
            ]),
      ),
    ];
  },
};

/** @type {import('./types.js').Page} */
export const apps = {
  id: 'apps',
  icon: 'apps',
  async render(pc) {
    const { t, system } = pc;
    const withSettings = system.apps.list().filter((a) => a.settings.length);
    const defaults = await system.defaults.list();
    const fc = { ctx: pc.ctx, local: pc.local, t };
    return [
      ...withSettings.map((a) =>
        group(
          pc.local(a.name),
          ...system.settings
            .describe(a.id)
            .map((decl) => settingRow(fc, /** @type {any} */ (decl), { scope: a.id, onSaved: pc.refresh })),
        ),
      ),
      group(
        t('group.defaults'),
        ...(defaults.length
          ? defaults.map((d) =>
              infoRow(
                d.type,
                system.apps.name(d.app),
                h('button', {
                  type: 'button',
                  class: 'nx-btn is-ghost',
                  text: t('apps.askAgain'),
                  onclick: async () => {
                    await system.defaults.clear(d.type);
                    pc.refresh();
                  },
                }),
              ),
            )
          : [h('p', { class: 'nx-set-desc', text: t('apps.noDefaults') })]),
      ),
      system.apps.has('nexus.appcenter')
        ? group(
            '',
            infoRow(
              t('apps.center'),
              t('apps.centerHint'),
              h('button', {
                type: 'button',
                class: 'nx-btn',
                text: t('apps.openCenter'),
                onclick: () => void system.windows.launch('nexus.appcenter'),
              }),
            ),
          )
        : null,
    ];
  },
};

/** @type {import('./types.js').Page} */
export const privacy = {
  id: 'privacy',
  icon: 'shield',
  async render(pc) {
    const { t, system } = pc;
    const summary = await system.privacy.summary();
    /** @param {string} key @param {number | null} count @param {() => Promise<unknown>} run */
    const clearRow = (key, count, run) =>
      infoRow(
        t(`privacy.${key}`),
        count === null ? t(`privacy.${key}Hint`) : t('privacy.count', { count }),
        h('button', {
          type: 'button',
          class: 'nx-btn',
          text: t('privacy.clear'),
          dataset: { testid: `clear-${key}` },
          onclick: async () => {
            await run();
            pc.toast(t('done.cleared'));
            pc.refresh();
          },
        }),
      );
    return [
      group(
        t('group.whatIsStored'),
        h(
          'div',
          { class: 'nx-set-row is-stack' },
          h('p', {}, icon('shield', { size: 16 }), ' ', t('privacy.local')),
          h('p', { class: 'nx-set-desc', text: t('privacy.noTracking') }),
          h('p', { class: 'nx-set-desc', text: t('privacy.network') }),
        ),
      ),
      group(
        t('group.history'),
        clearRow('clipboard', summary.clipboard, () => system.privacy.clearClipboardHistory()),
        clearRow('recent', summary.recent, () => system.privacy.clearRecentFiles()),
        clearRow('notifications', summary.notifications, () => system.privacy.clearNotifications()),
        clearRow('search', null, () => system.privacy.clearSearchHistory()),
        clearRow('log', summary.log, () => system.privacy.clearLog()),
      ),
    ];
  },
};
