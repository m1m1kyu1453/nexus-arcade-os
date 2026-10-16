// @ts-check
// Settings → Backup & Restore, Updates and About.
import { h, icon } from '../../../ui/dom.js';
import { renderMarkdownInto } from '../../../ui/markdown.js';
import { group, infoRow } from '../form.js';

/** @type {import('./types.js').Page} */
export const backup = {
  id: 'backup',
  icon: 'archive',
  keys: ['backupReminderDays'],
  async render(pc) {
    const { t, system, ctx } = pc;
    const last = await system.backup.lastBackupAt();

    // ─── Export ─────────────────────────────────────────────────────────
    const password = h('input', {
      class: 'nx-input',
      type: 'password',
      autocomplete: 'new-password',
      'aria-label': t('backup.password'),
    });
    const repeat = h('input', {
      class: 'nx-input',
      type: 'password',
      autocomplete: 'new-password',
      'aria-label': t('backup.repeat'),
    });
    const includeLog = h('input', { type: 'checkbox' });
    const exportError = h('p', { class: 'nx-set-error', role: 'alert', hidden: true });
    const exportBtn = h(
      'button',
      { type: 'button', class: 'nx-btn is-primary', dataset: { testid: 'backup-export' } },
      icon('download', { size: 16 }),
      t('backup.export'),
    );
    exportBtn.addEventListener('click', async () => {
      exportError.hidden = true;
      if (password.value !== repeat.value) {
        exportError.textContent = t('backup.mismatch');
        exportError.hidden = false;
        return;
      }
      exportBtn.disabled = true;
      try {
        const manifest = await system.backup.exportAndDownload({
          password: password.value || undefined,
          includeLog: includeLog.checked,
        });
        pc.toast(t('backup.exported', { size: ctx.i18n.bytes(manifest.bytes) }));
        pc.refresh();
      } catch (e) {
        exportError.textContent = String(/** @type {Error} */ (e).message);
        exportError.hidden = false;
      } finally {
        exportBtn.disabled = false;
      }
    });

    // ─── Import ─────────────────────────────────────────────────────────
    const fileInput = h('input', {
      type: 'file',
      accept: '.nexus-backup,application/zip,application/json',
      class: 'nx-visually-hidden',
      dataset: { testid: 'backup-file' },
    });
    const preview = h('div', { class: 'nx-set-preview', dataset: { testid: 'backup-preview' } });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) void showPreview(file);
      fileInput.value = '';
    });

    /** @param {File} file @param {string} [pass] */
    async function showPreview(file, pass) {
      preview.replaceChildren(h('p', { class: 'nx-set-desc', text: t('backup.reading') }));
      let info;
      try {
        info = await system.backup.inspect(file, pass);
      } catch (e) {
        preview.replaceChildren(
          h('p', { class: 'nx-set-error', role: 'alert', text: String(/** @type {Error} */ (e).message) }),
        );
        return;
      }
      if (info.needsPassword || !info.manifest) {
        const input = h('input', {
          class: 'nx-input',
          type: 'password',
          'aria-label': t('backup.password'),
          autocomplete: 'current-password',
        });
        const go = () => void showPreview(file, input.value);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        preview.replaceChildren(
          h('p', { text: pass ? t('backup.wrongPassword') : t('backup.encrypted') }),
          h(
            'div',
            { class: 'nx-set-inline' },
            input,
            h('button', { type: 'button', class: 'nx-btn', text: t('backup.unlock'), onclick: go }),
          ),
        );
        input.focus();
        return;
      }
      const m = info.manifest;
      const records = Object.values(m.stores).reduce((a, b) => a + b, 0);
      const mode = h(
        'select',
        { class: 'nx-select', 'aria-label': t('backup.mode') },
        h('option', { value: 'replace', text: t('backup.replace') }),
        h('option', { value: 'merge', text: t('backup.merge') }),
      );
      preview.replaceChildren(
        h(
          'dl',
          { class: 'nx-set-keys' },
          h('dt', { text: t('backup.created') }),
          h('dd', { text: ctx.i18n.date(new Date(m.createdAt), { dateStyle: 'long', timeStyle: 'short' }) }),
          h('dt', { text: t('backup.profile') }),
          h('dd', { text: m.profile.name }),
          h('dt', { text: t('backup.version') }),
          h('dd', { text: `Nexus ${m.nexusVersion}` }),
          h('dt', { text: t('backup.contents') }),
          h('dd', { text: t('backup.contentsValue', { records, files: m.blobs, size: ctx.i18n.bytes(m.bytes) }) }),
          h('dt', { text: t('backup.encryption') }),
          h('dd', { text: info.encrypted ? t('backup.yes') : t('backup.no') }),
        ),
        info.unknownStores.length
          ? h(
              'p',
              { class: 'nx-set-warning' },
              icon('warning', { size: 16 }),
              t('backup.unknownStores', { count: info.unknownStores.length }),
            )
          : null,
        h('label', { class: 'nx-field' }, h('span', { text: t('backup.mode') }), mode),
        h('p', { class: 'nx-set-desc', text: t('backup.modeHint') }),
        h('button', {
          type: 'button',
          class: 'nx-btn is-danger',
          text: t('backup.restore'),
          dataset: { testid: 'backup-restore' },
          onclick: async () => {
            const replace = mode.value === 'replace';
            if (
              !(await pc.confirm(t(replace ? 'backup.replaceConfirm' : 'backup.mergeConfirm'), {
                danger: replace,
                okLabel: t('backup.restore'),
              }))
            )
              return;
            try {
              const result = await system.backup.restore(file, {
                mode: /** @type {'replace' | 'merge'} */ (mode.value),
                password: pass,
              });
              await ctx.storage.kv.set('restored', { at: Date.now(), skipped: result.skipped });
              // Migrations and every service start fresh with the restored data.
              location.reload();
            } catch (e) {
              pc.toast(String(/** @type {Error} */ (e).message));
            }
          },
        }),
      );
    }

    const restored = /** @type {{ at: number, skipped: number } | undefined} */ (await ctx.storage.kv.get('restored'));
    if (restored) await ctx.storage.kv.delete('restored');

    return [
      restored
        ? h(
            'p',
            { class: 'nx-set-success', role: 'status' },
            icon('success', { size: 16 }),
            t('backup.restoredNotice', { count: restored.skipped }),
          )
        : null,
      group(
        t('group.export'),
        h(
          'div',
          { class: 'nx-set-row is-stack' },
          h('p', { class: 'nx-set-desc', text: t('backup.exportHint') }),
          h(
            'div',
            { class: 'nx-set-form is-row' },
            h('label', { class: 'nx-field' }, h('span', { text: t('backup.password') }), password),
            h('label', { class: 'nx-field' }, h('span', { text: t('backup.repeat') }), repeat),
          ),
          h('p', { class: 'nx-set-note' }, icon('warning', { size: 16 }), t('backup.passwordWarning')),
          h('label', { class: 'nx-set-check' }, includeLog, t('backup.includeLog')),
          exportError,
          exportBtn,
        ),
        infoRow(
          t('backup.last'),
          last ? ctx.i18n.date(last, { dateStyle: 'long', timeStyle: 'short' }) : t('backup.never'),
          null,
        ),
        pc.row('backupReminderDays'),
      ),
      group(
        t('group.import'),
        h(
          'div',
          { class: 'nx-set-row is-stack' },
          h('p', { class: 'nx-set-desc', text: t('backup.importHint') }),
          h('label', { class: 'nx-btn' }, fileInput, icon('upload', { size: 16 }), t('backup.choose')),
          preview,
        ),
      ),
    ];
  },
};

/** @type {import('./types.js').Page} */
export const updates = {
  id: 'updates',
  icon: 'refresh',
  async render(pc) {
    const { t, system } = pc;
    const info = system.info();
    const status = h('p', { class: 'nx-set-desc', role: 'status', dataset: { testid: 'update-status' } });
    const applyBtn = h('button', {
      type: 'button',
      class: 'nx-btn is-primary',
      text: t('updates.apply'),
      hidden: !system.updates.available,
      onclick: () => void system.updates.apply(),
    });
    const checkBtn = h('button', {
      type: 'button',
      class: 'nx-btn',
      text: t('updates.check'),
      onclick: async () => {
        status.textContent = t('updates.checking');
        const result = await system.updates.check();
        status.textContent = t(`updates.status.${result}`);
        applyBtn.hidden = result !== 'available';
      },
    });
    status.textContent = system.updates.available ? t('updates.status.available') : '';
    const changelog = h('div', { class: 'nx-set-changelog' });
    void system.about.changelog().then((md) => renderMarkdownInto(changelog, md));
    return [
      group(
        t('group.version'),
        infoRow(
          t('updates.installed'),
          t('updates.installedValue', {
            version: info.version,
            date: pc.ctx.i18n.date(new Date(info.buildDate), { dateStyle: 'long' }),
          }),
          null,
        ),
        info.edition === 'lite'
          ? h(
              'div',
              { class: 'nx-set-row is-stack' },
              h('p', { text: t('updates.lite') }),
              h('a', {
                class: 'nx-btn',
                href: system.about.liteUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                text: t('about.downloadLite'),
              }),
            )
          : system.updates.supported
            ? h(
                'div',
                { class: 'nx-set-row is-stack' },
                h('p', { class: 'nx-set-desc', text: t('updates.how') }),
                h('div', { class: 'nx-set-inline' }, checkBtn, applyBtn),
                status,
              )
            : h(
                'div',
                { class: 'nx-set-row is-stack' },
                h('p', { class: 'nx-set-desc', text: t('updates.unavailable') }),
              ),
      ),
      group(t('group.changelog'), changelog),
    ];
  },
};

/** @type {import('./types.js').Page} */
export const about = {
  id: 'about',
  icon: 'info',
  async render(pc) {
    const { t, system } = pc;
    const info = system.info();
    const a = system.about;
    const licenses = await a.licenses();
    const link = (/** @type {string} */ href, /** @type {string} */ text) =>
      h('a', { class: 'nx-btn', href, target: '_blank', rel: 'noopener noreferrer', text });
    return [
      h(
        'div',
        { class: 'nx-set-about', dataset: { testid: 'about' } },
        icon('nexus-mark', { size: 56 }),
        h('div', {}, h('h2', { text: 'Nexus Arcade OS' }), h('p', { text: t('about.tagline') })),
      ),
      group(
        t('group.thisCopy'),
        infoRow(t('about.version'), null, h('span', { text: info.version })),
        infoRow(t('about.edition'), null, h('span', { text: t(`about.editions.${info.edition}`) })),
        infoRow(
          t('about.built'),
          null,
          h('span', { text: pc.ctx.i18n.date(new Date(info.buildDate), { dateStyle: 'long', timeStyle: 'short' }) }),
        ),
        infoRow(t('about.profile'), null, h('span', { text: info.profile.name })),
      ),
      group(
        t('group.links'),
        infoRow(t('about.website'), a.liveUrl, link(a.liveUrl, t('about.open'))),
        infoRow(t('about.source'), a.repoUrl, link(a.repoUrl, t('about.open'))),
        info.edition === 'web'
          ? infoRow(
              t('about.lite'),
              t('about.liteHint'),
              h('a', {
                class: 'nx-btn',
                href: './nexus-lite.html',
                download: 'nexus-lite.html',
                text: t('about.downloadLite'),
              }),
            )
          : infoRow(t('about.lite'), t('about.youUseLite'), link(a.liveUrl, t('about.openWebsite'))),
        infoRow(
          t('about.changelog'),
          null,
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('about.showChangelog'),
            onclick: () => pc.navigate('updates'),
          }),
        ),
      ),
      group(
        t('group.licenses'),
        h('p', { class: 'nx-set-desc', text: t('about.licensesHint', { count: licenses.length }) }),
        h(
          'div',
          { class: 'nx-set-licenses', dataset: { testid: 'licenses' } },
          ...licenses.map((l) =>
            h(
              'details',
              { class: 'nx-set-license' },
              h(
                'summary',
                {},
                h('strong', { text: l.name }),
                l.version ? ` ${l.version}` : '',
                h('span', { class: 'nx-set-license-id', text: l.license }),
              ),
              h('pre', { text: l.text || t('about.noText') }),
            ),
          ),
        ),
        h('p', { class: 'nx-set-desc', text: t('about.nexusLicense') }),
      ),
    ];
  },
};
