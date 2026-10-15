// @ts-check
// Small DOM helpers shared by the shell and apps: element creation, icons and controls.
import './controls.css';
import { iconSvg } from './icons/icons.js';

/**
 * Creates an element. Props: `class`, `text`, `html` (trusted markup only), `on*` listeners,
 * `style` (object), `dataset` (object), and any attribute (true → empty, false/null → skipped).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [props]
 * @param {...(Node | string | null | undefined | false)} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

/**
 * An icon element (decorative unless a label is given).
 * @param {string} name
 * @param {{ size?: number, label?: string }} [options]
 */
export function icon(name, options) {
  const span = document.createElement('span');
  span.className = 'nx-icon-wrap';
  span.style.display = 'inline-flex';
  span.innerHTML = iconSvg(name, options);
  return span;
}

/**
 * @param {{ label?: string, icon?: string, variant?: 'primary' | 'danger' | 'ghost', onClick?: (e: MouseEvent) => void, type?: string, title?: string }} options
 */
export function button({ label, icon: iconName, variant, onClick, type = 'button', title }) {
  return h(
    'button',
    { class: `nx-btn${variant ? ` is-${variant}` : ''}`, type, onclick: onClick, title },
    iconName ? icon(iconName, { size: 16 }) : null,
    label ?? null,
  );
}

/**
 * Icon-only button with an accessible label (also shown as tooltip).
 * @param {{ icon: string, label: string, onClick?: (e: MouseEvent) => void, pressed?: boolean }} options
 */
export function iconButton({ icon: iconName, label, onClick, pressed }) {
  return h(
    'button',
    {
      class: 'nx-icon-btn',
      type: 'button',
      'aria-label': label,
      'data-tooltip': label,
      'aria-pressed': pressed === undefined ? undefined : String(pressed),
      onclick: onClick,
    },
    icon(iconName, { size: 18 }),
  );
}

/**
 * Accessible switch (checkbox with role="switch").
 * @param {{ label: string, checked: boolean, onChange: (checked: boolean) => void }} options
 */
export function toggle({ label, checked, onChange }) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'nx-toggle' }, input, h('span'), label);
}

/** Removes all children and appends new ones. @param {Element} el @param {...(Node | string)} children */
export function replace(el, ...children) {
  el.replaceChildren(...children);
  return el;
}

/** Keeps a box inside the viewport. @param {number} x @param {number} y @param {number} w @param {number} h @param {number} [margin] */
export function clampToViewport(x, y, w, h, margin = 4) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(margin, Math.min(x, vw - w - margin)),
    y: Math.max(margin, Math.min(y, vh - h - margin)),
  };
}
