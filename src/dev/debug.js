// Developer debug screen (dev builds only, open with #debug or the "Kernel debug screen"
// command). An overlay over the shell that inspects the kernel's services directly. Developer tool: English only, never shipped in production builds.
import { storageBreakdown } from '../services/storage/quota.js';
import { downloadBlob } from '../services/vfs/transfer.js';
import './debug.css';

/**
 * Tiny DOM helper: h('button', { onclick }, 'Label').
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...(Node | string | null | undefined | false)} children
 */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (value !== undefined && value !== false) el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

/** @param {string} title @param {...Node} content */
const section = (title, ...content) => h('section', { class: 'nx-debug-card' }, h('h2', {}, title), ...content);

/**
 * @param {HTMLElement} parent
 * @param {import('../kernel/system.js').System} system
 * @param {HTMLElement | null} [appsHost]  where a bare host renders app frames (null: apps open as shell windows)
 */
export function renderDebugScreen(parent, system, appsHost = null) {
  document.querySelector('.nx-debug')?.remove();
  const { bus, registry, lifecycle, logger, notifications, settings, theme, search, vfs, backup, db } = system;
  const t0 = performance.now();

  // Apps --------------------------------------------------------------------------------
  const appList = h('ul', { class: 'nx-debug-list' });
  const renderApps = () =>
    appList.replaceChildren(
      ...registry
        .list({ includeDisabled: true })
        .map((m) =>
          h(
            'li',
            {},
            h('code', {}, m.id),
            ` ${system.localize(m.name)} · ${m.category}${registry.isEnabled(m.id) ? '' : ' · disabled'}`,
            h('button', { onclick: () => lifecycle.launch(m.id) }, 'Launch'),
          ),
        ),
    );

  // Running instances -------------------------------------------------------------------
  const instances = h('ul', { class: 'nx-debug-list' });
  const renderInstances = () =>
    instances.replaceChildren(
      ...lifecycle.list().map((i) =>
        h(
          'li',
          {},
          h('code', {}, i.id),
          ` ${i.state}${i.suspended ? ` (suspended: ${i.suspendReasons.join(', ')})` : ''}${i.focused ? ' · focused' : ''} · timers ${i.activeTimers}`,
          h(
            'button',
            {
              onclick: () => (i.suspended ? lifecycle.resume(i.id, 'minimized') : lifecycle.suspend(i.id, 'minimized')),
            },
            i.suspended ? 'Resume' : 'Suspend',
          ),
          h('button', { onclick: () => lifecycle.close(i.id) }, 'Close'),
        ),
      ),
    );

  // Services ----------------------------------------------------------------------------
  const themeSelect = h(
    'select',
    {
      onchange: (/** @type {Event} */ e) =>
        settings.set('system', 'theme', /** @type {HTMLSelectElement} */ (e.target).value),
    },
    h('option', { value: 'auto' }, 'Auto'),
    ...theme.themes().map((th) => h('option', { value: th.id }, th.name.en)),
  );
  /** @type {HTMLSelectElement} */ (themeSelect).value = String(settings.get('system', 'theme'));
  const langSelect = h(
    'select',
    {
      onchange: (/** @type {Event} */ e) =>
        settings.set('system', 'language', /** @type {HTMLSelectElement} */ (e.target).value),
    },
    ...['auto', 'en', 'de'].map((l) => h('option', { value: l }, l)),
  );
  /** @type {HTMLSelectElement} */ (langSelect).value = String(settings.get('system', 'language'));
  const level = h('span');
  const renderLevel = () => {
    const l = system.achievements.level();
    level.textContent = `Level ${l.level} · ${l.xp} XP (${l.current}/${l.needed})`;
  };
  const services = h(
    'dl',
    { class: 'nx-debug-facts' },
    h('dt', {}, 'Storage'),
    h('dd', {}, `${system.engine.kind}${system.storageWarning ? ` (warning: ${system.storageWarning})` : ''}`),
    h('dt', {}, 'Profile'),
    h('dd', {}, `${system.profile.name} (/home/${system.profile.username})`),
    h('dt', {}, 'Search'),
    h('dd', {}, search.backendKind),
    h('dt', {}, 'Scheduler'),
    h('dd', {}, system.scheduler.isLeader ? 'leader tab' : 'follower tab'),
    h('dt', {}, 'Theme'),
    h('dd', {}, themeSelect),
    h('dt', {}, 'Language'),
    h('dd', {}, langSelect),
    h('dt', {}, 'Achievements'),
    h('dd', {}, level),
  );

  // Notifications -----------------------------------------------------------------------
  const notifyButtons = h(
    'div',
    { class: 'nx-debug-row' },
    h(
      'button',
      { onclick: () => notifications.notify({ title: 'Hello from the kernel', body: 'A plain toast.' }) },
      'Toast',
    ),
    h(
      'button',
      {
        onclick: async () => {
          const n = await notifications.notify({ title: 'Choose', actions: [{ id: 'ok', label: 'OK' }] });
          n.onAction((a) => logger.child('debug').info(`Action ${a} clicked`));
        },
      },
      'With action',
    ),
    h(
      'button',
      {
        onclick: async () => {
          const n = await notifications.notify({ title: 'Working…', progress: 0 });
          for (let p = 1; p <= 10; p++) setTimeout(() => n.update({ progress: p / 10 }), p * 300);
          setTimeout(() => n.close(), 3500);
        },
      },
      'Progress',
    ),
    h(
      'button',
      {
        onclick: () =>
          system.scheduler.schedule('nexus.dev.test', {
            title: 'Debug reminder',
            body: 'Scheduled 5 s ago',
            at: Date.now() + 5000,
          }),
      },
      'Reminder in 5 s',
    ),
    h(
      'button',
      { onclick: () => settings.set('system', 'doNotDisturb', !settings.get('system', 'doNotDisturb')) },
      'Toggle DND',
    ),
  );

  // Storage -----------------------------------------------------------------------------
  const storeList = h('ul', { class: 'nx-debug-list' });
  const records = h('pre', { class: 'nx-debug-pre' });
  const renderStorage = async () => {
    const rows = await storageBreakdown(db);
    storeList.replaceChildren(
      ...rows.map((r) =>
        h(
          'li',
          {},
          h('code', {}, r.store),
          ` ${r.count} records · ${system.i18n.format.bytes(r.bytes)}`,
          h(
            'button',
            {
              onclick: async () => {
                const sample = await db.getAll(r.store, { limit: 5 });
                records.textContent = JSON.stringify(
                  sample,
                  (_k, v) => (v instanceof Blob ? `[Blob ${v.type} ${v.size}B]` : v),
                  2,
                );
              },
            },
            'Show 5',
          ),
        ),
      ),
    );
  };

  // Search ------------------------------------------------------------------------------
  const searchResults = h('ul', { class: 'nx-debug-list' });
  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Search apps, commands, settings, files…',
    'aria-label': 'Search',
    oninput: async (/** @type {Event} */ e) => {
      const results = await search.query(/** @type {HTMLInputElement} */ (e.target).value);
      searchResults.replaceChildren(
        ...results.map((r) =>
          h(
            'li',
            {},
            h('code', {}, r.type),
            ` ${r.title} `,
            h('small', {}, r.snippet ?? r.subtitle ?? ''),
            ` · ${Math.round(r.score)}`,
          ),
        ),
      );
    },
  });

  // Backup ------------------------------------------------------------------------------
  const backupStatus = h('span');
  const backupRow = h(
    'div',
    { class: 'nx-debug-row' },
    h(
      'button',
      {
        onclick: async () => {
          const { blob, filename, manifest } = await backup.export();
          backupStatus.textContent = `Exported ${Object.values(manifest.stores).reduce((a, b) => a + b, 0)} records`;
          downloadBlob(blob, filename);
        },
      },
      'Export backup',
    ),
    h('input', {
      type: 'file',
      accept: '.nexus-backup',
      'aria-label': 'Restore backup (replace)',
      onchange: async (/** @type {Event} */ e) => {
        const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
        if (!file) return;
        const preview = await backup.inspect(file);
        const password = preview.needsPassword ? (prompt('Backup password') ?? undefined) : undefined;
        const info = preview.manifest ?? (await backup.inspect(file, password)).manifest;
        if (!confirm(`Replace all data with the backup of "${info?.profile.name}" from ${info?.createdAt}?`)) return;
        await backup.restore(file, { mode: 'replace', password });
        location.reload();
      },
    }),
    backupStatus,
  );

  // Event + system log ------------------------------------------------------------------
  const log = h('ol', { class: 'nx-debug-log', 'aria-live': 'off' });
  /** @param {string} kind @param {string} text */
  const addLine = (kind, text) => {
    log.prepend(h('li', { class: `is-${kind}` }, `${((performance.now() - t0) / 1000).toFixed(2)}s `, text));
    while (log.childElementCount > 300) log.lastElementChild?.remove();
  };
  for (const e of logger.entries({ limit: 50 })) addLine(e.level, `[${e.source}] ${e.message}`);
  const unsubs = [
    bus.on('*', (payload, type) => {
      addLine('event', `${type} ${safeJson(payload)}`);
      if (type.startsWith('app:')) {
        renderInstances();
        renderApps();
      }
      if (type.startsWith('xp:')) renderLevel();
    }),
    logger.subscribe((e) => addLine(e.level, `[${e.source}] ${e.message}`)),
  ];

  // Layout ------------------------------------------------------------------------------
  const screen = h(
    'div',
    { class: 'nx-debug', role: 'region', 'aria-label': 'Nexus debug screen' },
    h(
      'header',
      {},
      h('h1', {}, 'Nexus kernel debug'),
      h('span', {}, `${system.env.edition} · ${system.profile.name}`),
      h(
        'button',
        {
          onclick: () => {
            for (const u of unsubs) u();
            screen.remove();
            if (appsHost) document.body.append(appsHost);
            history.replaceState(null, '', location.pathname);
          },
        },
        'Close debug',
      ),
    ),
    h(
      'div',
      { class: 'nx-debug-grid' },
      section('Apps', appList),
      section('Running', instances, appsHost ?? ''),
      section('Services', services),
      section('Notifications & scheduler', notifyButtons),
      section('Search', searchInput, searchResults),
      section('Storage', storeList, records, h('button', { onclick: renderStorage }, 'Refresh')),
      section('Backup', backupRow, h('p', {}, `VFS home: ${vfs.home}`)),
      section('Event & system log', log),
    ),
  );
  parent.append(screen);
  renderApps();
  renderInstances();
  renderLevel();
  renderStorage();
}

/** @param {unknown} value */
function safeJson(value) {
  try {
    const text = JSON.stringify(value, (_k, v) => (v instanceof Blob ? '[Blob]' : v));
    return text && text.length > 160 ? `${text.slice(0, 160)}…` : (text ?? '');
  } catch {
    return '';
  }
}
