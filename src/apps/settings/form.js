// @ts-check
// Renders one setting from its declaration (SettingDecl + current value) as a labelled control:
// toggle, choice (radio-like segmented control for few options, select for many), slider or
// number, text, colour and folder. Changes are saved at once through ctx.system.settings.
import { h, icon } from '../../ui/dom.js';

/** @typedef {import('../../kernel/types').SettingDecl & { value: unknown, isDefault: boolean }} Described */

/**
 * @typedef {object} FormContext
 * @property {import('../../kernel/types').AppContext} ctx
 * @property {(text: import('../../kernel/types').L10n | string) => string} local
 * @property {(key: string, vars?: Record<string, unknown>) => string} t
 */

/** DOM id of a setting row (deep links scroll to it). @param {string} scope @param {string} key */
export const rowId = (scope, key) => `nx-set-${scope.replace(/[^\w-]/g, '_')}-${key}`;

/**
 * @param {FormContext} fc
 * @param {Described} decl
 * @param {{ scope?: string, onSaved?: () => void }} [options]
 */
export function settingRow(fc, decl, { scope = 'system', onSaved } = {}) {
  const { ctx, local, t } = fc;
  const system = /** @type {NonNullable<typeof ctx.system>} */ (ctx.system);
  const id = rowId(scope, decl.key);
  const label = local(decl.label);
  const error = h('p', { class: 'nx-set-error', role: 'alert', hidden: true });

  /** @param {unknown} value */
  async function save(value) {
    error.hidden = true;
    try {
      await system.settings.set(decl.key, value, scope);
      onSaved?.();
    } catch (e) {
      error.textContent = String(/** @type {Error} */ (e).message);
      error.hidden = false;
    }
  }

  const inputId = `${id}-input`;
  let control;
  if (decl.type === 'boolean') {
    const input = h('input', { type: 'checkbox', role: 'switch', id: inputId });
    input.checked = !!decl.value;
    input.addEventListener('change', () => void save(input.checked));
    control = h('label', { class: 'nx-toggle nx-set-switch' }, input, h('span'));
  } else if (decl.type === 'enum') {
    if (decl.options.length <= 4) {
      control = h(
        'div',
        { class: 'nx-set-segments', role: 'radiogroup', 'aria-labelledby': `${id}-label` },
        ...decl.options.map((o) => {
          const on = o.value === decl.value;
          const b = h('button', {
            type: 'button',
            role: 'radio',
            class: `nx-set-segment${on ? ' is-on' : ''}`,
            'aria-checked': String(on),
            tabindex: on ? '0' : '-1',
            text: local(o.label),
            onclick: () => void save(o.value),
          });
          return b;
        }),
      );
      // Arrow keys move between the options, like native radio buttons.
      control.addEventListener('keydown', (e) => {
        const buttons = /** @type {HTMLElement[]} */ ([...control.querySelectorAll('button')]);
        const i = buttons.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        const step =
          e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step || i < 0) return;
        e.preventDefault();
        const next = buttons[(i + step + buttons.length) % buttons.length];
        next?.focus();
        next?.click();
      });
    } else {
      const select = h(
        'select',
        { class: 'nx-select', id: inputId },
        ...decl.options.map((o) => h('option', { value: o.value, text: local(o.label) })),
      );
      select.value = String(decl.value);
      select.addEventListener('change', () => void save(select.value));
      control = select;
    }
  } else if (decl.type === 'number') {
    const { min, max, step = 1 } = decl;
    const value = Number(decl.value);
    if (min !== undefined && max !== undefined && (max - min) / step <= 400) {
      const output = h('output', { class: 'nx-set-value', for: inputId, text: formatNumber(fc, decl, value) });
      const range = h('input', {
        type: 'range',
        class: 'nx-slider',
        id: inputId,
        min: String(min),
        max: String(max),
        step: String(step),
      });
      range.value = String(value);
      range.addEventListener('input', () => (output.textContent = formatNumber(fc, decl, Number(range.value))));
      range.addEventListener('change', () => void save(Number(range.value)));
      control = h('div', { class: 'nx-set-range' }, range, output);
    } else {
      const input = h('input', {
        type: 'number',
        class: 'nx-input nx-set-number',
        id: inputId,
        min: min ?? undefined,
        max: max ?? undefined,
        step: String(step),
      });
      input.value = String(value);
      input.addEventListener('change', () => void save(Number(input.value)));
      control = input;
    }
  } else if (decl.type === 'color') {
    const value = String(decl.value || '');
    const swatch = h('span', { class: 'nx-set-swatch', style: { background: value || 'var(--accent)' } });
    const pick = h(
      'button',
      {
        type: 'button',
        class: 'nx-btn',
        id: inputId,
        onclick: async () => {
          const chosen = await /** @type {any} */ (ctx.dialog).color({ title: label, value: value || undefined });
          if (chosen) void save(chosen);
        },
      },
      swatch,
      value || t('form.themeColor'),
    );
    const reset = value
      ? h('button', { type: 'button', class: 'nx-btn is-ghost', text: t('form.reset'), onclick: () => void save('') })
      : null;
    control = h('div', { class: 'nx-set-inline' }, pick, reset);
  } else if (decl.type === 'path') {
    const value = String(decl.value || '');
    control = h(
      'div',
      { class: 'nx-set-inline' },
      h('code', { class: 'nx-set-path', text: value || t('form.none') }),
      h('button', {
        type: 'button',
        class: 'nx-btn',
        id: inputId,
        text: t('form.choose'),
        onclick: async () => {
          const path = await /** @type {any} */ (ctx.dialog).openFolder({ title: label, startIn: value || undefined });
          if (typeof path === 'string') void save(path);
        },
      }),
      value
        ? h('button', { type: 'button', class: 'nx-btn is-ghost', text: t('form.clear'), onclick: () => void save('') })
        : null,
    );
  } else {
    const input = h('input', { type: decl.type === 'date' ? 'date' : 'text', class: 'nx-input', id: inputId });
    input.value = String(decl.value ?? '');
    input.addEventListener('change', () => void save(input.value));
    control = input;
  }

  const resetBtn =
    decl.isDefault || decl.type === 'color' || decl.type === 'path'
      ? null
      : h(
          'button',
          {
            type: 'button',
            class: 'nx-icon-btn nx-set-reset',
            'aria-label': t('form.resetLabel', { name: label }),
            'data-tooltip': t('form.reset'),
            onclick: async () => {
              await system.settings.reset(decl.key, scope);
              onSaved?.();
            },
          },
          icon('undo', { size: 16 }),
        );

  return h(
    'div',
    { class: 'nx-set-row', id, dataset: { setting: `${scope}/${decl.key}`, testid: 'setting-row' } },
    h(
      'div',
      { class: 'nx-set-text' },
      h(decl.type === 'enum' && decl.options.length <= 4 ? 'span' : 'label', {
        id: `${id}-label`,
        class: 'nx-set-label',
        for: inputId,
        text: label,
      }),
      decl.description ? h('p', { class: 'nx-set-desc', text: local(decl.description) }) : null,
      error,
    ),
    h('div', { class: 'nx-set-control' }, control, resetBtn),
  );
}

/** Slider value as shown: percentages for 0–1 scales, plain numbers otherwise. @param {FormContext} fc @param {Described} decl @param {number} n */
function formatNumber(fc, decl, n) {
  // Fractions of 1 (transparency, dimming, volumes) read best as percentages.
  if (decl.type === 'number' && decl.min === 0 && (decl.max ?? 2) <= 1 && (decl.step ?? 1) < 1)
    return fc.ctx.i18n.number(n, { style: 'percent' });
  if (decl.key === 'fontScale') return fc.ctx.i18n.number(n, { style: 'percent' });
  return fc.ctx.i18n.number(n);
}

/** A titled group of rows. @param {string} title @param {...(Node | null | false)} children */
export function group(title, ...children) {
  return h(
    'section',
    { class: 'nx-set-group' },
    title ? h('h3', { text: title }) : null,
    h('div', { class: 'nx-set-card' }, ...children),
  );
}

/**
 * A row with custom content (buttons, status) in the same layout as setting rows.
 * @param {string} label
 * @param {string | null} description
 * @param {...(Node | string | null | false)} controls
 */
export function infoRow(label, description, ...controls) {
  return h(
    'div',
    { class: 'nx-set-row' },
    h(
      'div',
      { class: 'nx-set-text' },
      h('span', { class: 'nx-set-label', text: label }),
      description ? h('p', { class: 'nx-set-desc', text: description }) : null,
    ),
    h('div', { class: 'nx-set-control' }, ...controls),
  );
}
