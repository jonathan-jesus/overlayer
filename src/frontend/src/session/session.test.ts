import { describe, it, expect, beforeEach } from 'vitest';
import { getSessionId, clearSessionId } from './session';

describe('session', () => {
  beforeEach(() => {
    clearSessionId();
  });

  it('generates a valid UUID v4 on first call', () => {
    const id = getSessionId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('returns the same ID on subsequent calls', () => {
    const first = getSessionId();
    const second = getSessionId();
    expect(second).toBe(first);
  });

  it('generates a fresh ID after clearSessionId', () => {
    const first = getSessionId();
    clearSessionId();
    const second = getSessionId();
    expect(second).not.toBe(first);
  });
});
