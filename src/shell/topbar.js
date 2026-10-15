// @ts-check
// Top bar / system tray: launcher button, active app, workspace indicator, network state,
// volume, clock with calendar, notifications bell and the profile menu.
import { identiconSvg } from '../services/profiles/identicon.js';
import { h, icon, replace } from '../ui/dom.js';
import { openMenu } from '../ui/menu.js';
import { openPopover } from '../ui/overlay.js';
import { appName } from './util.js';
import './topbar.css';

/** @param {import('./shell.js').ShellContext} shell */
export function createTopBar(shell) {
  const sys = shell.system();
  const { t } = shell;

  const launcherBtn = h(
    'button',
    {
      class: 'nx-tb-btn nx-tb-launcher',
      type: 'button',
      'aria-label': t('shell.launcher'),
      'data-tooltip': t('shell.launcher'),
      onclick: () => shell.ui.launcher?.toggle(),
    },
    icon('nexus-mark', { size: 18 }),
  );
  const activeApp = h('span', { class: 'nx-tb-app', 'aria-live': 'polite' });
  const workspaces = h('div', { class: 'nx-tb-workspaces', role: 'group', 'aria-label': t('shell.workspaces') });
  const network = h('span', { class: 'nx-tb-status' });
  const volumeBtn = h('button', { class: 'nx-tb-btn', type: 'button' });
  const bellBtn = h('button', {
    class: 'nx-tb-btn nx-tb-bell',
    type: 'button',
    onclick: () => shell.ui.center?.toggle(),
  });
  const clockBtn = h('button', { class: 'nx-tb-btn nx-tb-clock', type: 'button' });
  const profileBtn = h('button', {
    class: 'nx-tb-btn nx-tb-profile',
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-label': t('shell.profileMenu'),
  });

  const bar = h(
    'header',
    { class: 'nx-topbar nx-glass', role: 'banner' },
    h('div', { class: 'nx-tb-left' }, launcherBtn, activeApp),
    h('div', { class: 'nx-tb-center' }, workspaces),
    h('div', { class: 'nx-tb-right' }, network, volumeBtn, bellBtn, clockBtn, profileBtn),
  );
  shell.layers.chrome.append(bar);

  // Active app ---------------------------------------------------------------
  const renderActive = () => {
    const id = shell.wm.focusedId();
    const w = id ? shell.wm.get(id) : null;
    activeApp.textContent = w ? appName(sys, w.appId) : t('shell.desktop');
  };

  // Workspaces ---------------------------------------------------------------
  const renderWorkspaces = () =>
    replace(
      workspaces,
      ...shell.wm.workspaces.map((ws) =>
        h(
          'button',
          {
            class: `nx-tb-ws${ws.current ? ' is-current' : ''}${ws.windows ? ' has-windows' : ''}`,
            type: 'button',
            'aria-pressed': String(ws.current),
            'aria-label': t('shell.workspaceN', { n: ws.index + 1, name: ws.name || '' }).trim(),
            'data-tooltip': ws.name || t('shell.workspaceN', { n: ws.index + 1, name: '' }).trim(),
            onclick: () => shell.wm.switchWorkspace(ws.index),
          },
          h('span'),
        ),
      ),
    );

  // Network ------------------------------------------------------------------
  const renderNetwork = () => {
    const online = navigator.onLine;
    const label = t(online ? 'shell.online' : 'shell.offline');
    replace(network, icon(online ? 'online' : 'offline', { size: 16, label }));
    network.dataset.tooltip = label;
    network.classList.toggle('is-offline', !online);
  };
  addEventListener('online', renderNetwork);
  addEventListener('offline', renderNetwork);

  // Volume -------------------------------------------------------------------
  const renderVolume = () => {
    const muted = !!sys.settings.get('system', 'soundMuted');
    const level = /** @type {number} */ (sys.settings.get('system', 'soundMaster'));
    const name = muted || level === 0 ? 'volume-off' : level < 0.4 ? 'volume-low' : 'volume';
    replace(volumeBtn, icon(name, { size: 16 }));
    const label = muted ? t('shell.muted') : t('shell.volumeLevel', { level: Math.round(level * 100) });
    volumeBtn.setAttribute('aria-label', label);
    volumeBtn.dataset.tooltip = label;
  };
  volumeBtn.addEventListener('click', () => {
    const slider = h('input', {
      class: 'nx-slider',
      type: 'range',
      min: '0',
      max: '1',
      step: '0.05',
      'aria-label': t('shell.volume'),
    });
    slider.value = String(sys.settings.get('system', 'soundMaster'));
    slider.addEventListener('input', () => sys.settings.set('system', 'soundMaster', Number(slider.value)));
    const mute = h('input', { type: 'checkbox', role: 'switch' });
    mute.checked = !!sys.settings.get('system', 'soundMuted');
    mute.addEventListener('change', () => sys.settings.set('system', 'soundMuted', mute.checked));
    openPopover(
      volumeBtn,
      h(
        'div',
        { class: 'nx-tb-volume' },
        h('div', { class: 'nx-tb-volume-row' }, icon('volume-low', { size: 16 }), slider, icon('volume', { size: 16 })),
        h('label', { class: 'nx-toggle' }, mute, h('span'), t('shell.mute')),
      ),
      { label: t('shell.volume') },
    );
  });

  // Notifications bell -----------------------------------------------------
  const renderBell = async () => {
    const count = await sys.notifications.unreadCount();
    const dnd = sys.notifications.doNotDisturb;
    replace(
      bellBtn,
      icon(dnd ? 'bell-off' : 'bell', { size: 16 }),
      count ? h('span', { class: 'nx-badge', text: count > 99 ? '99+' : String(count) }) : '',
    );
    const label = t('shell.notificationsCount', { count });
    bellBtn.setAttribute('aria-label', label);
    bellBtn.dataset.tooltip = label;
  };

  // Clock + calendar ---------------------------------------------------------
  const renderClock = () => {
    const now = new Date();
    clockBtn.textContent = `${sys.i18n.format.date(now, { weekday: 'short', day: 'numeric', month: 'short' })}  ${sys.i18n.format.time(now)}`;
    clockBtn.setAttribute('aria-label', sys.i18n.format.dateTime(now));
  };
  clockBtn.addEventListener('click', () => openPopover(clockBtn, calendar(sys), { label: t('shell.calendar') }));
  const tick = () => {
    renderClock();
    setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
  };

  // Profile ----------------------------------------------------------------
  const profile = sys.profile;
  profileBtn.innerHTML =
    profile.avatar.kind === 'identicon' ? identiconSvg(profile.avatar.seed, profile.accent, '#0b0e1a') : '';
  if (profile.avatar.kind === 'image')
    profileBtn.append(h('img', { src: URL.createObjectURL(profile.avatar.image), alt: '' }));
  profileBtn.dataset.tooltip = profile.name;
  profileBtn.addEventListener('click', () =>
    openMenu(
      [
        { label: profile.name, icon: 'user', disabled: true },
        'separator',
        { label: t('shell.lock'), icon: 'lock', shortcut: 'Mod+L', run: () => shell.ui.lock?.lock() },
        { label: t('shell.switchProfile'), icon: 'users', run: () => shell.ui.lock?.switchProfile() },
        { label: t('shell.personalize'), icon: 'palette', run: () => shell.ui.personalize?.open() },
        'separator',
        { label: t('shell.logOut'), icon: 'log-out', run: () => shell.ui.lock?.logOut() },
      ],
      { anchor: profileBtn, label: t('shell.profileMenu') },
    ),
  );

  const renderAll = () => {
    renderActive();
    renderWorkspaces();
    renderNetwork();
    renderVolume();
    renderBell();
    renderClock();
    launcherBtn.setAttribute('aria-label', t('shell.launcher'));
  };
  for (const type of ['window:focused', 'window:closed', 'window:opened', 'app:focused', 'app:blurred'])
    sys.bus.on(type, renderActive);
  for (const type of ['workspace:changed', 'window:opened', 'window:closed', 'window:moved'])
    sys.bus.on(type, renderWorkspaces);
  for (const type of ['notifications:history-changed', 'notification:shown', 'notifications:dnd-changed'])
    sys.bus.on(type, renderBell);
  sys.settings.onChange('system', '*', (_v, key) => {
    if (key.startsWith('sound')) renderVolume();
    if (key === 'doNotDisturb') renderBell();
  });
  sys.i18n.onChange(renderAll);
  renderAll();
  tick();
  return { element: bar, height: () => bar.offsetHeight };
}

/**
 * Month calendar (popover from the clock).
 * @param {import('../kernel/system.js').System} sys
 */
function calendar(sys) {
  const today = new Date();
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  const title = h('strong', { class: 'nx-cal-title', 'aria-live': 'polite' });
  const grid = h('div', { class: 'nx-cal-grid', role: 'grid' });
  const nav = (/** @type {number} */ delta) => {
    view = new Date(view.getFullYear(), view.getMonth() + delta, 1);
    render();
  };
  // Week starts on Monday for German, Sunday for English (as the locales expect).
  const firstDay = () => (sys.i18n.locale === 'de' ? 1 : 0);
  function render() {
    title.textContent = sys.i18n.format.date(view, { month: 'long', year: 'numeric' });
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2024, 0, 7 + ((i + firstDay()) % 7)); // a week starting on Sunday
      cells.push(
        h('span', {
          class: 'nx-cal-dow',
          role: 'columnheader',
          text: sys.i18n.format.date(d, { weekday: 'narrow' }),
          title: sys.i18n.format.date(d, { weekday: 'long' }),
        }),
      );
    }
    const offset = (view.getDay() - firstDay() + 7) % 7;
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let i = 0; i < offset; i++) cells.push(h('span'));
    for (let d = 1; d <= days; d++) {
      const isToday =
        d === today.getDate() && view.getMonth() === today.getMonth() && view.getFullYear() === today.getFullYear();
      cells.push(
        h('span', {
          class: `nx-cal-day${isToday ? ' is-today' : ''}`,
          role: 'gridcell',
          'aria-current': isToday ? 'date' : undefined,
          text: String(d),
        }),
      );
    }
    replace(grid, ...cells);
  }
  render();
  return h(
    'div',
    { class: 'nx-cal' },
    h(
      'div',
      { class: 'nx-cal-head' },
      h(
        'button',
        {
          class: 'nx-icon-btn',
          type: 'button',
          'aria-label': sys.i18n.t('system', 'shell.previousMonth'),
          onclick: () => nav(-1),
        },
        icon('chevron-left', { size: 16 }),
      ),
      title,
      h(
        'button',
        {
          class: 'nx-icon-btn',
          type: 'button',
          'aria-label': sys.i18n.t('system', 'shell.nextMonth'),
          onclick: () => nav(1),
        },
        icon('chevron-right', { size: 16 }),
      ),
    ),
    grid,
    h('p', { class: 'nx-cal-today', text: sys.i18n.format.date(today, { dateStyle: 'full' }) }),
  );
}
