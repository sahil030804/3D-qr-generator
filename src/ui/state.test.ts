import { describe, expect, it } from 'vitest';
import { readState, writeQuery, type AppState } from './state';

const fallback: AppState = { text: 'https://example.com', objectId: 'cherry-tree', variantId: 'blossom', time: 'night' };

describe('share state', () => {
  it('round-trips text including unicode', () => {
    const state: AppState = { text: 'https://example.com/café?x=1&y=✓', objectId: 'car', variantId: 'blue', time: 'dusk' };
    expect(readState('?' + writeQuery(state), fallback)).toEqual(state);
  });

  it('ignores invalid values and falls back', () => {
    const state = readState('?q=%%%&o=nope&v=nope&t=noon', fallback);
    expect(state).toEqual(fallback);
  });

  it('ignores a variant that does not belong to the object', () => {
    const state = readState('?o=pine-tree&v=blue', fallback);
    expect(state.objectId).toBe('pine-tree');
    expect(state.variantId).toBe('evergreen');
  });
});
