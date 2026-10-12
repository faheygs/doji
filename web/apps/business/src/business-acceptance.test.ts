import { describe, expect, it } from 'vitest';
import { businessAcceptance } from './business-acceptance';

describe('business acceptance presentation', () => {
  const now = Date.parse('2026-10-11T16:00:00Z');
  const until = '2026-10-11T18:00:00Z';
  it('keeps existing-account sign-in available after expiry without reopening registration', () => {
    for (const mode of [null, 'signin', 'acceptance', 'reset']) {
      expect(businessAcceptance(until, mode, now + 86400000, true)).toEqual({
        configured: true, register: false, access: true,
      });
    }
    expect(businessAcceptance(until, 'register', now + 86400000, true)).toEqual({
      configured: true, register: false, access: false,
    });
    expect(businessAcceptance(until, 'acceptance', now, true).register).toBe(false);
  });
  it('has no effect without explicit release configuration', () => {
    expect(businessAcceptance(undefined, 'acceptance', now)).toEqual({
      configured: false,
      register: false,
      access: false,
    });
  });
  it('permits the test entry and reset page, never public registration or sign-in', () => {
    expect(businessAcceptance(until, 'acceptance', now)).toEqual({
      configured: true,
      register: true,
      access: true,
    });
    expect(businessAcceptance(until, 'reset', now)).toEqual({
      configured: true,
      register: false,
      access: true,
    });
    for (const mode of [null, 'register', 'signin'])
      expect(businessAcceptance(until, mode, now)).toEqual({
        configured: true,
        register: false,
        access: false,
      });
  });
  it('keeps access paused after expiry or malformed/overlong windows', () => {
    for (const value of [
      'invalid',
      '',
      new Date(now).toISOString(),
      new Date(now + 7200001).toISOString(),
    ])
      expect(businessAcceptance(value, 'acceptance', now)).toEqual({
        configured: true,
        register: false,
        access: false,
      });
  });
});
