// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderPlaceholder } from '../../src/shell/placeholder.js';
import { pickStrings } from '../../src/shell/strings.js';

function render(edition = /** @type {'web' | 'lite'} */ ('web')) {
  const root = document.createElement('div');
  const { t, locale } = pickStrings(['en']);
  const screen = renderPlaceholder(root, { t, locale, version: '1.2.3', buildDate: '2026-10-15T12:00:00Z', edition });
  /** @param {string} id */
  const field = (id) => /** @type {HTMLElement} */ (root.querySelector(`[data-testid="${id}"]`));
  return { root, screen, field };
}

describe('placeholder screen', () => {
  it('shows version, edition and phase', () => {
    const { root, field } = render('lite');
    expect(field('version').textContent).toBe('1.2.3');
    expect(field('edition').dataset.edition).toBe('lite');
    expect(root.textContent).toContain('Phase 1 — kernel ready');
  });

  it('updates network, worker and storage state', () => {
    const { screen, field } = render();
    screen.setOnline(false);
    expect(field('network').dataset.state).toBe('offline');
    expect(field('network').textContent).toContain('Offline');
    screen.setWorkers('ok');
    expect(field('workers').textContent).toBe('Running');
    screen.setStorage('best-effort');
    expect(field('storage').dataset.state).toBe('best-effort');
  });
});
