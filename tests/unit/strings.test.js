import { describe, expect, it } from 'vitest';
import { pickStrings } from '../../src/shell/strings.js';

describe('placeholder strings', () => {
  it('follows the first supported browser language', () => {
    expect(pickStrings(['de-AT', 'en']).locale).toBe('de');
    expect(pickStrings(['fr-FR', 'en-GB', 'de']).locale).toBe('en');
    expect(pickStrings(['fr-FR', 'de-CH']).locale).toBe('de');
  });

  it('falls back to English', () => {
    expect(pickStrings(['ja']).locale).toBe('en');
    expect(pickStrings([]).locale).toBe('en');
  });

  it('has the same non-empty keys in English and German', () => {
    const en = pickStrings(['en']).t;
    const de = pickStrings(['de']).t;
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(en), ...Object.values(de)]) expect(value).not.toBe('');
  });
});
