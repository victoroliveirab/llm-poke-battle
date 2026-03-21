import { describe, expect, it } from 'bun:test';
import { getTypeEffectiveness } from './type-effectiveness';

describe('type effectiveness calculation', () => {
  it('combines both defending types', () => {
    expect(getTypeEffectiveness('fire', 'grass', 'steel')).toBe(4);
    expect(getTypeEffectiveness('electric', 'ground', null)).toBe(0);
  });
});
