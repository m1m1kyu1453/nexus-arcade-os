// @ts-check
// Internationalisation: messages per namespace ('system' or an app id) and language, loaded
// lazily; English is the fallback. Formatting uses Intl throughout.
//
// Message files are JSON; nested objects are addressed with dots ("dialog.ok"). Syntax:
//   "Hello, {name}"                         interpolation
//   { "=0": "No files", "one": "{count} file", "other": "{count} files" }
//                                           plural forms, chosen by `count` (Intl.PluralRules)

/** @typedef {'en' | 'de'} Locale */
/** @typedef {Record<string, any>} Messages */
/** @typedef {Partial<Record<Locale, () => Promise<{ default: Messages } | Messages>>>} MessageLoaders */

export const LOCALES = /** @type {const} */ (['en', 'de']);
export const FALLBACK = /** @type {Locale} */ ('en');

/**
 * First supported language from the browser's preference list.
 * @param {readonly string[]} preferred
 * @returns {Locale}
 */
export function detectLocale(preferred) {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (/** @type {readonly string[]} */ (LOCALES).includes(base)) return /** @type {Locale} */ (base);
  }
  return FALLBACK;
}

/**
 * "a.b.c" → nested value.
 * @param {Messages | undefined} messages
 * @param {string} key
 */
function lookup(messages, key) {
  /** @type {any} */
  let current = messages;
  for (const part of key.split('.')) {
    if (current === null || typeof current !== 'object' || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * @param {object} options
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {import('../../kernel/logger.js').Logger} options.log
 * @param {Locale} [options.locale]
 * @param {boolean} [options.dev]   log missing keys
 */
export function createI18n({ bus, log, locale: initial = FALLBACK, dev = false }) {
  let locale = initial;
  /** @type {Map<string, MessageLoaders>} */
  const loaders = new Map();
  /** @type {Map<string, Messages>} 'ns:locale' → messages */
  const loaded = new Map();
  /** @type {Map<string, Promise<void>>} */
  const loading = new Map();
  /** @type {Set<string>} */
  const reportedMissing = new Set();
  /** @type {Map<string, any>} */
  const formatters = new Map();
  /** BCP 47 tag for date/number formats, or null to use the language. @type {string | null} */
  let region = null;

  /** @param {string} ns @param {Locale} l */
  async function loadOne(ns, l) {
    const key = `${ns}:${l}`;
    if (loaded.has(key)) return;
    let promise = loading.get(key);
    if (!promise) {
      promise = (async () => {
        const loader = loaders.get(ns)?.[l];
        if (!loader) return;
        try {
          const mod = await loader();
          loaded.set(key, /** @type {any} */ (mod)?.default ?? mod);
        } catch (error) {
          log.error(`Could not load ${l} messages for ${ns}`, error);
        } finally {
          loading.delete(key);
        }
      })();
      loading.set(key, promise);
    }
    await promise;
  }

  /**
   * @template {new (...args: any[]) => any} C
   * @param {C} Ctor
   * @param {object} options
   * @returns {InstanceType<C>}
   */
  function formatter(Ctor, options = {}) {
    // Dates and numbers follow the region (e.g. "en-GB" or "de-CH"); plural rules the language.
    const tag = /** @type {unknown} */ (Ctor) === Intl.PluralRules ? locale : (region ?? locale);
    const key = `${Ctor.name}:${tag}:${JSON.stringify(options)}`;
    let f = formatters.get(key);
    if (!f) {
      f = new Ctor(tag, options);
      formatters.set(key, f);
    }
    return f;
  }

  /**
   * @param {string} template
   * @param {Record<string, unknown>} vars
   */
  function interpolate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      if (!(name in vars)) return match;
      const v = vars[name];
      return typeof v === 'number' ? formatter(Intl.NumberFormat).format(v) : String(v);
    });
  }

  /**
   * @param {string} ns
   * @param {string} key
   * @param {Record<string, unknown>} [vars]
   * @returns {string}
   */
  function translate(ns, key, vars = {}) {
    let message = lookup(loaded.get(`${ns}:${locale}`), key);
    if (message === undefined && locale !== FALLBACK) {
      message = lookup(loaded.get(`${ns}:${FALLBACK}`), key);
      if (message !== undefined) reportMissing(ns, key, locale);
    }
    if (message === undefined) {
      reportMissing(ns, key, FALLBACK);
      return key;
    }
    if (message !== null && typeof message === 'object') {
      const count = vars.count;
      if (typeof count !== 'number') return key;
      const exact = message[`=${count}`];
      const form = exact ?? message[formatter(Intl.PluralRules).select(count)] ?? message.other;
      if (typeof form !== 'string') return key;
      message = form;
    }
    return typeof message === 'string' ? interpolate(message, vars) : key;
  }

  /** @param {string} ns @param {string} key @param {Locale} l */
  function reportMissing(ns, key, l) {
    if (!dev) return;
    const id = `${ns}:${l}:${key}`;
    if (reportedMissing.has(id)) return;
    reportedMissing.add(id);
    log.warn(`Missing ${l} message "${key}" in ${ns}`);
  }

  const format = {
    /** @param {Date | number} value @param {Intl.DateTimeFormatOptions} [options] */
    date: (value, options = { dateStyle: 'medium' }) => formatter(Intl.DateTimeFormat, options).format(value),
    /** @param {Date | number} value @param {Intl.DateTimeFormatOptions} [options] */
    time: (value, options = { timeStyle: 'short' }) => formatter(Intl.DateTimeFormat, options).format(value),
    /** @param {Date | number} value */
    dateTime: (value) => formatter(Intl.DateTimeFormat, { dateStyle: 'medium', timeStyle: 'short' }).format(value),
    /** @param {number} value @param {Intl.NumberFormatOptions} [options] */
    number: (value, options) => formatter(Intl.NumberFormat, options).format(value),
    /** @param {number} value @param {string} currency ISO 4217, e.g. 'EUR' */
    currency: (value, currency) => formatter(Intl.NumberFormat, { style: 'currency', currency }).format(value),
    /** @param {number} value 0–1 */
    percent: (value) => formatter(Intl.NumberFormat, { style: 'percent', maximumFractionDigits: 1 }).format(value),
    /** @param {number} bytes */
    bytes(bytes) {
      const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];
      let i = 0;
      let v = bytes;
      while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
      }
      return formatter(Intl.NumberFormat, {
        style: 'unit',
        unit: units[i],
        unitDisplay: 'short',
        maximumFractionDigits: i ? 1 : 0,
      }).format(v);
    },
    /** @param {number} value @param {Intl.RelativeTimeFormatUnit} unit */
    relative: (value, unit) => formatter(Intl.RelativeTimeFormat, { numeric: 'auto' }).format(value, unit),
    /**
     * "3 minutes ago", "in 2 days", "yesterday" — unit chosen automatically.
     * @param {Date | number} when
     * @param {number} [now]
     */
    ago(when, now = Date.now()) {
      const seconds = Math.round((+when - now) / 1000);
      const abs = Math.abs(seconds);
      /** @type {[Intl.RelativeTimeFormatUnit, number][]} */
      const steps = [
        ['second', 1],
        ['minute', 60],
        ['hour', 3600],
        ['day', 86400],
        ['week', 604800],
        ['month', 2629800],
        ['year', 31557600],
      ];
      let [unit, size] = steps[0];
      for (const step of steps) if (abs >= step[1]) [unit, size] = step;
      return format.relative(Math.round(seconds / size), unit);
    },
    /** @param {string[]} items @param {Intl.ListFormatOptions} [options] */
    list: (items, options = { type: 'conjunction' }) => formatter(Intl.ListFormat, options).format(items),
    /** @param {number} count */
    plural: (count) => formatter(Intl.PluralRules).select(count),
  };

  return {
    get locale() {
      return locale;
    },

    /**
     * Registers lazy message loaders for a namespace (does not load them yet).
     * @param {string} ns
     * @param {MessageLoaders} messageLoaders
     */
    register(ns, messageLoaders) {
      loaders.set(ns, messageLoaders);
      for (const l of LOCALES) loaded.delete(`${ns}:${l}`);
    },

    /** Loads a namespace's messages for the current language and the fallback. */
    async load(/** @type {string} */ ns) {
      await Promise.all([loadOne(ns, locale), loadOne(ns, FALLBACK)]);
    },

    /** Switches language at runtime: loads messages of every loaded namespace, then announces. */
    async setLocale(/** @type {Locale} */ next) {
      if (!LOCALES.includes(next)) throw new Error(`Unsupported language "${next}"`);
      if (next === locale) return;
      const namespaces = new Set([...loaded.keys()].map((k) => k.slice(0, k.lastIndexOf(':'))));
      await Promise.all([...namespaces].map((ns) => loadOne(ns, next)));
      locale = next;
      formatters.clear();
      globalThis.document?.documentElement.setAttribute('lang', next);
      bus.emit('i18n:changed', { locale: next });
    },

    /**
     * Formats for dates, times and numbers ("de-CH", "en-GB" …); null follows the language.
     * @param {string | null} tag
     */
    setRegion(tag) {
      let next = null;
      try {
        if (tag && Intl.DateTimeFormat.supportedLocalesOf(tag).length) next = tag;
      } catch {
        // Not a valid language tag: follow the language.
      }
      if (next === region) return;
      region = next;
      formatters.clear();
      bus.emit('i18n:changed', { locale, region });
    },
    get region() {
      return region;
    },

    t: translate,
    format,

    /** `ctx.i18n` for one namespace. @param {string} ns */
    scoped(ns) {
      const api = {
        get locale() {
          return locale;
        },
        /** @param {string} key @param {Record<string, unknown>} [vars] */
        t: (key, vars) => translate(ns, key, vars),
        ...format,
        /** @param {() => void} fn */
        onChange: (fn) => bus.on('i18n:changed', () => fn()),
      };
      return api;
    },

    /** @param {() => void} fn */
    onChange: (fn) => bus.on('i18n:changed', () => fn()),
  };
}

/** @typedef {ReturnType<typeof createI18n>} I18nService */
