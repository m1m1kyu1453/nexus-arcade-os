// @ts-check
// App lifecycle: launch → mount → (focus/blur, suspend/resume) → unmount, plus crash handling.
//
// The shell supplies a `host` that owns the visible frame of each instance (a window from
// phase 2 on, a bare container on the phase 1 debug screen). The kernel never touches the
// host's DOM beyond the container it is given.
import { createBoundary, createCrashReport } from './error-boundary.js';
import { createRuntime } from './runtime.js';

/** @typedef {import('./types').AppManifest} AppManifest */
/** @typedef {import('./types').AppInstance} AppInstance */
/** @typedef {import('./types').LaunchArgs} LaunchArgs */
/** @typedef {'minimized' | 'workspace' | 'hidden'} SuspendReason */
/** @typedef {'loading' | 'running' | 'crashed' | 'closing'} InstanceState */

/**
 * @typedef {object} HostFrame
 * @property {HTMLElement} container  where the app mounts
 * @property {any} window             the WindowHandle exposed as ctx.window
 */

/**
 * @typedef {object} Host
 * @property {(manifest: AppManifest, info: { instanceId: string }) => HostFrame} open
 * @property {(instanceId: string) => void} close
 * @property {(instanceId: string) => void} [focus]
 * @property {(instanceId: string, report: import('./error-boundary.js').CrashReport, actions: { restart(): void, close(): void }) => void} showCrash
 */

/**
 * @typedef {object} InstanceRecord
 * @property {string} id
 * @property {string} appId
 * @property {AppManifest} manifest
 * @property {InstanceState} state
 * @property {LaunchArgs} args
 * @property {number} launchedAt
 * @property {Set<SuspendReason>} suspendReasons
 * @property {import('./runtime.js').Runtime} runtime
 * @property {import('./error-boundary.js').Boundary} boundary
 * @property {AppInstance | undefined} app
 * @property {HostFrame | undefined} frame
 */

/**
 * @typedef {object} ContextExtras
 * @property {string} instanceId
 * @property {any} window
 * @property {import('./runtime.js').Runtime} runtime
 * @property {import('./error-boundary.js').Boundary} boundary
 */

/**
 * @param {object} options
 * @param {import('./registry.js').Registry} options.registry
 * @param {import('./bus.js').EventBus} options.bus
 * @param {import('./logger.js').SystemLogger} options.logger
 * @param {Host} options.host
 * @param {(manifest: AppManifest, extras: ContextExtras) => import('./types').AppContext} options.createContext
 * @param {string} options.os  e.g. "0.1.0 (web)" for crash reports
 * @param {(manifest: AppManifest) => Promise<void>} [options.prepare]  runs before mount (e.g. load messages)
 * @param {Document} [options.document]  to suspend apps while the tab is hidden
 * @param {import('./runtime.js').Clock} [options.clock]
 */
export function createLifecycle({ registry, bus, logger, host, createContext, os, document, clock, prepare }) {
  const log = logger.child('kernel');
  /** @type {Map<string, InstanceRecord>} */
  const instances = new Map();
  /** @type {Map<string, number>} */
  const counters = new Map();
  /** @type {string | null} */
  let focusedId = null;

  /** @param {string} id */
  function require(id) {
    const instance = instances.get(id);
    if (!instance) throw new Error(`No running instance "${id}"`);
    return instance;
  }

  /** @param {InstanceRecord} i */
  const info = (i) => ({
    id: i.id,
    appId: i.appId,
    state: i.state,
    suspended: i.suspendReasons.size > 0,
    suspendReasons: [...i.suspendReasons],
    focused: focusedId === i.id,
    launchedAt: i.launchedAt,
    activeTimers: i.runtime.activeCount,
    busyMs: i.boundary.busyMs,
    loops: i.runtime.loopCount,
    args: i.args,
  });

  /**
   * @param {InstanceRecord} i
   * @param {'onSuspend' | 'onResume' | 'onIntent'} hook
   * @param {any[]} args
   */
  function callHook(i, hook, ...args) {
    const fn = i.app?.[hook];
    if (typeof fn === 'function') i.boundary.wrap(() => /** @type {Function} */ (fn).apply(i.app, args), 'lifecycle')();
  }

  /** @param {InstanceRecord} i */
  function teardown(i) {
    i.runtime.dispose();
  }

  /**
   * @param {InstanceRecord} i
   * @param {unknown} error
   * @param {import('./error-boundary.js').ErrorSource} source
   */
  function crash(i, error, source) {
    if (!instances.has(i.id) || i.state === 'closing' || i.state === 'crashed') return;
    i.state = 'crashed';
    const report = createCrashReport({
      manifest: i.manifest,
      instanceId: i.id,
      error,
      source,
      os,
      recentLog: logger.entries({ limit: 30 }),
    });
    logger.log('error', `app:${i.appId}`, `Crashed during ${source}: ${report.message}`, error);
    try {
      const result = i.app?.unmount?.();
      if (result && typeof result.then === 'function') result.catch(() => {});
    } catch {
      // A crashing app may fail to clean up; the runtime still clears everything we own.
    }
    teardown(i);
    if (focusedId === i.id) focusedId = null;
    host.showCrash(i.id, report, { restart: () => void restart(i.id), close: () => void close(i.id) });
    bus.emit('app:crashed', { id: i.id, appId: i.appId, report });
  }

  /**
   * @param {string} appId
   * @param {LaunchArgs} [args]
   * @returns {Promise<string>} instance id
   */
  async function launch(appId, args = {}) {
    const manifest = registry.get(appId);
    if (!manifest) throw new Error(`Unknown app "${appId}"`);
    if (!registry.isEnabled(appId)) throw new Error(`App "${appId}" is disabled`);

    if (manifest.window?.singleInstance) {
      const existing = [...instances.values()].find((i) => i.appId === appId && i.state !== 'closing');
      if (existing) {
        if (existing.state === 'crashed') {
          await close(existing.id);
        } else {
          focus(existing.id);
          if (args.intent) callHook(existing, 'onIntent', args.intent);
          return existing.id;
        }
      }
    }

    const n = (counters.get(appId) ?? 0) + 1;
    counters.set(appId, n);
    const id = `${appId}#${n}`;
    /** @type {InstanceRecord} */
    const instance = /** @type {any} */ ({
      id,
      appId,
      manifest,
      state: 'loading',
      args,
      launchedAt: Date.now(),
      suspendReasons: new Set(),
      app: undefined,
      frame: undefined,
    });
    instance.boundary = createBoundary({ onCrash: (error, source) => crash(instance, error, source) });
    instance.runtime = createRuntime({ boundary: instance.boundary, clock });
    instances.set(id, instance);
    if (document?.hidden) instance.suspendReasons.add('hidden');
    bus.emit('app:launching', { id, appId });

    instance.frame = host.open(manifest, { instanceId: id });
    const loaded = await instance.boundary.run(async () => {
      const [module] = await Promise.all([registry.load(appId), prepare?.(manifest)]);
      return module;
    }, 'load');
    if (!loaded.ok || instance.state !== 'loading') return id;

    const ctx = createContext(manifest, {
      instanceId: id,
      window: instance.frame.window,
      runtime: instance.runtime,
      boundary: instance.boundary,
    });
    const mounted = await instance.boundary.run(
      () => loaded.value.mount(/** @type {HostFrame} */ (instance.frame).container, ctx, args),
      'mount',
    );
    if (!mounted.ok || instance.state !== 'loading') return id;

    instance.app = mounted.value ?? {};
    instance.state = 'running';
    if (instance.suspendReasons.size) {
      instance.runtime.suspend();
      callHook(instance, 'onSuspend');
    }
    log.info(`Launched ${id}`);
    bus.emit('app:launched', { id, appId });
    focus(id);
    return id;
  }

  /**
   * Closes a window. A running app may veto with `canClose()` (unsaved changes) unless `force`.
   * @param {string} id
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<boolean>} false if the app kept the window open
   */
  async function close(id, { force = false } = {}) {
    const i = instances.get(id);
    if (!i || i.state === 'closing') return true;
    if (!force && i.state === 'running' && typeof i.app?.canClose === 'function') {
      let ok = true;
      try {
        ok = (await i.app.canClose()) !== false;
      } catch (error) {
        logger.log('warn', `app:${i.appId}`, 'canClose failed', error);
      }
      if (!ok || !instances.has(id)) return false;
    }
    // Another close may have started while canClose() was waiting.
    if (/** @type {InstanceState} */ (i.state) === 'closing') return true;
    const wasCrashed = i.state === 'crashed';
    i.state = 'closing';
    if (!wasCrashed && i.app?.unmount) {
      try {
        await withTimeout(Promise.resolve(i.app.unmount()), 5000);
      } catch (error) {
        logger.log('warn', `app:${i.appId}`, 'unmount failed', error);
      }
    }
    teardown(i);
    instances.delete(id);
    if (focusedId === id) {
      focusedId = null;
      bus.emit('app:blurred', { id, appId: i.appId });
    }
    host.close(id);
    log.info(`Closed ${id}`);
    bus.emit('app:closed', { id, appId: i.appId });
    return true;
  }

  /** @param {string} id */
  async function restart(id) {
    const i = require(id);
    const { appId, args } = i;
    await close(id);
    return launch(appId, args);
  }

  /** @param {string} id */
  function focus(id) {
    const i = require(id);
    if (focusedId === id) return;
    const previous = focusedId ? instances.get(focusedId) : undefined;
    focusedId = id;
    if (previous) bus.emit('app:blurred', { id: previous.id, appId: previous.appId });
    host.focus?.(id);
    bus.emit('app:focused', { id, appId: i.appId });
  }

  /**
   * @param {string} id
   * @param {SuspendReason} reason
   */
  function suspend(id, reason) {
    const i = require(id);
    const wasSuspended = i.suspendReasons.size > 0;
    i.suspendReasons.add(reason);
    if (wasSuspended || i.state !== 'running') return;
    i.runtime.suspend();
    callHook(i, 'onSuspend');
    bus.emit('app:suspended', { id, appId: i.appId, reason });
  }

  /**
   * @param {string} id
   * @param {SuspendReason} reason
   */
  function resume(id, reason) {
    const i = require(id);
    if (!i.suspendReasons.delete(reason) || i.suspendReasons.size > 0 || i.state !== 'running') return;
    i.runtime.resume();
    callHook(i, 'onResume');
    bus.emit('app:resumed', { id, appId: i.appId });
  }

  if (document) {
    document.addEventListener('visibilitychange', () => {
      for (const id of instances.keys()) {
        if (document.hidden) suspend(id, 'hidden');
        else resume(id, 'hidden');
      }
    });
  }

  return {
    launch,
    close,
    restart,
    focus,
    suspend,
    resume,
    /** @param {string} id */
    get: (id) => {
      const i = instances.get(id);
      return i && info(i);
    },
    list: () => [...instances.values()].map(info),
    get focusedId() {
      return focusedId;
    },
    /**
     * The app's own state for session restore (AppInstance.saveState), or undefined.
     * @param {string} id
     */
    appState(id) {
      const i = instances.get(id);
      if (!i || i.state !== 'running' || typeof i.app?.saveState !== 'function') return undefined;
      try {
        return i.app.saveState();
      } catch (error) {
        logger.log('warn', `app:${i.appId}`, 'saveState failed', error);
        return undefined;
      }
    },
    /** Reports an error that happened outside the app's own callbacks but belongs to it. */
    reportError(/** @type {string} */ id, /** @type {unknown} */ error) {
      const i = instances.get(id);
      if (i) i.boundary.report(error, 'callback');
    },
  };
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

/** @typedef {ReturnType<typeof createLifecycle>} Lifecycle */
