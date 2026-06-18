import { describe, it, expect } from 'vitest';
import { canvasReducer } from './canvasReducer';
import type { TextElement, RectElement } from './canvasReducer';

function makeText(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'el-1',
    kind: 'text',
    text: 'Hello',
    fontSize: 24,
    font: 'Inter',
    fill: '#ff0000',
    x: 10,
    y: 20,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 100,
    shadow: { color: '#000000', opacity: 100, distance: 0, angle: 135, blur: 0 },
    visible: true,
    ...overrides,
  };
}

function makeRect(overrides: Partial<RectElement> = {}): RectElement {
  return {
    id: 'el-2',
    kind: 'rect',
    fill: '#6366f1',
    stroke: '#ffffff',
    strokeWidth: 0,
    strokeAlign: 'center',
    width: 200,
    height: 100,
    x: 10,
    y: 20,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 100,
    shadow: { color: '#000000', opacity: 100, distance: 0, angle: 135, blur: 0 },
    visible: true,
    ...overrides,
  };
}

describe('canvasReducer', () => {
  describe('ADD_TEXT', () => {
    it('appends a text element with default values', () => {
      const state = canvasReducer([], { type: 'ADD_TEXT' });

      expect(state).toHaveLength(1);
      expect(state[0]).toMatchObject({
        kind: 'text',
        text: 'Text',
        fontSize: 32,
        font: 'Inter',
        fill: '#ffffff',
        x: 50,
        y: 50,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 100,
      });
      expect(state[0].id).toBeDefined();
    });
  });

  describe('ADD_RECT', () => {
    it('appends a rect element with default values', () => {
      const state = canvasReducer([], { type: 'ADD_RECT' });

      expect(state).toHaveLength(1);
      expect(state[0]).toMatchObject({
        kind: 'rect',
        fill: '#6366f1',
        stroke: '#ffffff',
        strokeWidth: 0,
        width: 200,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        opacity: 100,
      });
      expect(state[0].id).toBeDefined();
    });
  });

  describe('ADD_IMAGE', () => {
    it('appends an image element with the provided src and dimensions', () => {
      const src = 'data:image/png;base64,ABC==';
      const state = canvasReducer([], { type: 'ADD_IMAGE', src, width: 800, height: 600 });

      expect(state).toHaveLength(1);
      expect(state[0]).toMatchObject({
        kind: 'image',
        src,
        width: 800,
        height: 600,
        scaleX: 1,
        scaleY: 1,
        opacity: 100,
      });
      expect(state[0].id).toBeDefined();
    });
  });

  describe('REORDER_ELEMENTS', () => {
    it('moves an element from one index to another', () => {
      const a = makeText({ id: 'a' });
      const b = makeRect({ id: 'b' });
      const c = makeText({ id: 'c' });

      const state = canvasReducer([a, b, c], {
        type: 'REORDER_ELEMENTS',
        fromIndex: 0,
        toIndex: 2,
      });

      expect(state.map((el) => el.id)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('UPDATE_ELEMENT', () => {
    it('patches the target element and leaves others untouched', () => {
      const el1 = makeText({ id: 'el-1', text: 'Original' });
      const el2 = makeText({ id: 'el-2', text: 'Other' });

      const state = canvasReducer([el1, el2], {
        type: 'UPDATE_ELEMENT',
        id: 'el-1',
        patch: { text: 'Updated', fontSize: 48 },
      });

      expect(state[0]).toMatchObject({ id: 'el-1', text: 'Updated', fontSize: 48 });
      expect(state[1]).toEqual(el2);
    });
  });

  describe('MOVE_ELEMENT', () => {
    it('updates x/y of the target element and leaves others untouched', () => {
      const el1 = makeText({ id: 'el-1', x: 10, y: 20 });
      const el2 = makeRect({ id: 'el-2', x: 100, y: 200 });

      const state = canvasReducer([el1, el2], {
        type: 'MOVE_ELEMENT',
        id: 'el-1',
        x: 300,
        y: 400,
      });

      expect(state[0]).toMatchObject({ id: 'el-1', x: 300, y: 400 });
      expect(state[1]).toEqual(el2);
    });
  });

  describe('DELETE_ELEMENT', () => {
    it('removes only the target element', () => {
      const el1 = makeText({ id: 'el-1' });
      const el2 = makeRect({ id: 'el-2' });

      const state = canvasReducer([el1, el2], { type: 'DELETE_ELEMENT', id: 'el-1' });

      expect(state).toHaveLength(1);
      expect(state[0].id).toBe('el-2');
    });
  });
});
