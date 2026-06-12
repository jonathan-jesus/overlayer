import { describe, it, expect } from 'vitest';
import { canvasReducer } from './canvasReducer';
import type { TextElement } from './canvasReducer';

function makeElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'el-1',
    text: 'Hello',
    x: 10,
    y: 20,
    fontSize: 24,
    color: '#ff0000',
    ...overrides,
  };
}

describe('canvasReducer', () => {
  it('ADD_ELEMENT appends a new element with default values', () => {
    const state = canvasReducer([], { type: 'ADD_ELEMENT' });

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({
      text: 'Text',
      x: 50,
      y: 50,
      fontSize: 32,
      color: '#ffffff',
    });
    expect(state[0].id).toBeDefined();
  });

  it('UPDATE_ELEMENT patches the target element and leaves others untouched', () => {
    const el1 = makeElement({ id: 'el-1', text: 'Original' });
    const el2 = makeElement({ id: 'el-2', text: 'Other' });
    const initial = [el1, el2];

    const state = canvasReducer(initial, {
      type: 'UPDATE_ELEMENT',
      id: 'el-1',
      patch: { text: 'Updated', fontSize: 48 },
    });

    expect(state[0]).toMatchObject({ id: 'el-1', text: 'Updated', fontSize: 48 });
    expect(state[1]).toEqual(el2);
  });

  it('MOVE_ELEMENT updates x/y of the target element and leaves others untouched', () => {
    const el1 = makeElement({ id: 'el-1', x: 10, y: 20 });
    const el2 = makeElement({ id: 'el-2', x: 100, y: 200 });
    const initial = [el1, el2];

    const state = canvasReducer(initial, {
      type: 'MOVE_ELEMENT',
      id: 'el-1',
      x: 300,
      y: 400,
    });

    expect(state[0]).toMatchObject({ id: 'el-1', x: 300, y: 400 });
    expect(state[1]).toEqual(el2);
  });

  it('DELETE_ELEMENT removes only the target element', () => {
    const el1 = makeElement({ id: 'el-1' });
    const el2 = makeElement({ id: 'el-2' });
    const initial = [el1, el2];

    const state = canvasReducer(initial, { type: 'DELETE_ELEMENT', id: 'el-1' });

    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('el-2');
  });
});
