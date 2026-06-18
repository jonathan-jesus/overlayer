import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CanvasAdorner, { getElementBounds } from './CanvasAdorner';
import type { RectElement, TextElement } from './canvasReducer';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const DISPLAY_WIDTH = 400;
const DISPLAY_HEIGHT = 225;

function makeRect(overrides: Partial<RectElement> = {}): RectElement {
  return {
    id: 'rect-1',
    kind: 'rect',
    x: 0,
    y: 0,
    width: 400,
    height: 200,
    fill: '#ff0000',
    stroke: '#000',
    strokeWidth: 0,
    strokeAlign: 'center',
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 100,
    shadow: { color: '#000', distance: 0, angle: 0, blur: 0, opacity: 100 },
    visible: true,
    ...overrides,
  };
}

function makeText(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'text-1',
    kind: 'text',
    text: 'Hi',
    fontSize: 32,
    font: 'Inter',
    fill: '#ffffff',
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 100,
    shadow: { color: '#000', distance: 0, angle: 0, blur: 0, opacity: 100 },
    visible: true,
    ...overrides,
  };
}

// Mock DOM geometry so hit-testing and scale-factor work in jsdom
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    get: () => DISPLAY_WIDTH,
    configurable: true,
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: DISPLAY_WIDTH,
    bottom: DISPLAY_HEIGHT,
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    get: () => 0,
    configurable: true,
  });
});

describe('getElementBounds', () => {
  it('returns the canvas-space bounds for a rect', () => {
    const el = makeRect({ x: 10, y: 20, width: 300, height: 150, scaleX: 2, scaleY: 1.5 });
    const b = getElementBounds(el);
    expect(b).toEqual({ x: 10, y: 20, width: 600, height: 225 });
  });

  it('estimates bounds for a text element', () => {
    const el = makeText({ x: 50, y: 100, text: 'Hi', fontSize: 32, scaleX: 1, scaleY: 1 });
    const b = getElementBounds(el);
    expect(b.x).toBe(50);
    expect(b.y).toBe(100);
    expect(b.width).toBeGreaterThan(0);
    expect(b.height).toBe(32);
  });
});

describe('CanvasAdorner', () => {
  it('calls onSelect(null) when pointer-down misses all elements', () => {
    const onSelect = vi.fn();
    render(
      <CanvasAdorner
        elements={[]}
        selectedId={null}
        canvasWidth={CANVAS_WIDTH}
        canvasHeight={CANVAS_HEIGHT}
        onSelect={onSelect}
        onEditingChange={vi.fn()}
        dispatch={vi.fn()}
        keepProportions={false}
        zoomScale={1}
      />
    );

    fireEvent.pointerDown(screen.getByTestId('canvas-adorner'), {
      clientX: 50,
      clientY: 30,
      button: 0,
    });

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('calls onSelect(id) when pointer-down hits an element bounding box', () => {
    const onSelect = vi.fn();
    // scaleFactor = 400 / 1920 =~ 0.208
    // rect at canvas (0,0) 400×200 => display (0,0) to (83, 42)
    // click at display (40, 20) => canvas (~192, ~96) => inside rect
    const el = makeRect({ id: 'rect-1', x: 0, y: 0, width: 400, height: 200 });

    render(
      <CanvasAdorner
        elements={[el]}
        selectedId={null}
        canvasWidth={CANVAS_WIDTH}
        canvasHeight={CANVAS_HEIGHT}
        onSelect={onSelect}
        onEditingChange={vi.fn()}
        dispatch={vi.fn()}
        keepProportions={false}
        zoomScale={1}
      />
    );

    fireEvent.pointerDown(screen.getByTestId('canvas-adorner'), {
      clientX: 40,
      clientY: 20,
      button: 0,
    });

    expect(onSelect).toHaveBeenCalledWith('rect-1');
  });

  it('renders 8 resize handles when an element is selected', () => {
    const el = makeRect({ id: 'rect-1' });

    render(
      <CanvasAdorner
        elements={[el]}
        selectedId="rect-1"
        canvasWidth={CANVAS_WIDTH}
        canvasHeight={CANVAS_HEIGHT}
        onSelect={vi.fn()}
        onEditingChange={vi.fn()}
        dispatch={vi.fn()}
        keepProportions={false}
        zoomScale={1}
      />
    );

    const handles = document.querySelectorAll('[data-handle]');
    expect(handles).toHaveLength(8);
  });

  it('renders no selection box when selectedId is null', () => {
    const el = makeRect();
    render(
      <CanvasAdorner
        elements={[el]}
        selectedId={null}
        canvasWidth={CANVAS_WIDTH}
        canvasHeight={CANVAS_HEIGHT}
        onSelect={vi.fn()}
        onEditingChange={vi.fn()}
        dispatch={vi.fn()}
        keepProportions={false}
        zoomScale={1}
      />
    );

    expect(document.querySelector('.canvas-adorner__selection')).not.toBeInTheDocument();
  });

  it('dispatches MOVE_ELEMENT as the pointer moves after hitting an element', () => {
    const dispatch = vi.fn();
    const el = makeRect({ id: 'rect-1', x: 0, y: 0, width: 400, height: 200 });
    render(
      <CanvasAdorner
        elements={[el]}
        selectedId={null}
        canvasWidth={CANVAS_WIDTH}
        canvasHeight={CANVAS_HEIGHT}
        onSelect={vi.fn()}
        onEditingChange={vi.fn()}
        dispatch={dispatch}
        keepProportions={false}
        zoomScale={1}
      />
    );

    const adorner = screen.getByTestId('canvas-adorner');
    fireEvent.pointerDown(adorner, { clientX: 40, clientY: 20, button: 0, pointerId: 1 });
    fireEvent.pointerMove(adorner, { clientX: 50, clientY: 20, pointerId: 1 });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MOVE_ELEMENT', id: 'rect-1' })
    );
  });

  it('dispatches UPDATE_ELEMENT with proportional scaleX and scaleY when keepProportions is true and corner handles are dragged', () => {
    const dispatch = vi.fn();
    const el = makeRect({ id: 'rect-1', x: 0, y: 0, width: 200, height: 100, scaleX: 1, scaleY: 1 });
    render(
      <CanvasAdorner
        elements={[el]}
        selectedId="rect-1"
        canvasWidth={CANVAS_WIDTH}
        canvasHeight={CANVAS_HEIGHT}
        onSelect={vi.fn()}
        onEditingChange={vi.fn()}
        dispatch={dispatch}
        keepProportions={true}
        zoomScale={1}
      />
    );

    const brHandle = document.querySelector('[data-handle="br"]')!;

    const canvasToDisplayScale = DISPLAY_WIDTH / CANVAS_WIDTH;
    const dragX = 20;
    const dragY = 5;

    fireEvent.pointerDown(brHandle, { clientX: 200 * canvasToDisplayScale, clientY: 100 * canvasToDisplayScale, button: 0 });
    fireEvent.pointerMove(brHandle, { clientX: (200 * canvasToDisplayScale) + dragX, clientY: (100 * canvasToDisplayScale) + dragY });

    // Dominant axis is X because horizontal drag is larger
    const dragXInCanvas = dragX / canvasToDisplayScale;
    const expectedScale = (200 + dragXInCanvas) / 200;

    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ELEMENT',
      id: 'rect-1',
      patch: {
        scaleX: expectedScale,
        scaleY: expectedScale,
      },
    });
  });
});
