import { useRef } from 'react';
import type { CanvasElement, CanvasAction } from './canvasReducer';
import './CanvasAdorner.css';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type HandleId = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l';

const HANDLES: HandleId[] = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'];

const APPROX_CHAR_ASPECT_RATIO = 0.55;

type DragState =
  | {
    type: 'moving';
    elementId: string;
    startScreenX: number;
    startScreenY: number;
    origX: number;
    origY: number;
  }
  | {
    type: 'scaling';
    elementId: string;
    handle: HandleId;
    startScreenX: number;
    startScreenY: number;
    origBounds: BoundingBox;
    origScaleX: number;
    origScaleY: number;
  };

export function getElementBounds(el: CanvasElement): BoundingBox {
  switch (el.kind) {
    case 'text':
      return {
        x: el.x,
        y: el.y,
        width: Math.max(el.text.length * el.fontSize * APPROX_CHAR_ASPECT_RATIO * el.scaleX, 10),
        height: el.fontSize * el.scaleY,
      };
    case 'rect':
      return { x: el.x, y: el.y, width: el.width * el.scaleX, height: el.height * el.scaleY };
    case 'image':
      return { x: el.x, y: el.y, width: el.width * el.scaleX, height: el.height * el.scaleY };
  }
}

function hitTest(elements: CanvasElement[], cx: number, cy: number): string | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    const b = getElementBounds(el);
    if (cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height) {
      return el.id;
    }
  }
  return null;
}

function applyScaleHandle(
  handle: HandleId,
  canvasDeltaX: number,
  canvasDeltaY: number,
  origBounds: BoundingBox,
  origScaleX: number,
  origScaleY: number,
): { scaleX: number; scaleY: number; x?: number; y?: number } {
  const MIN_SCALE = 0.05;
  const bw = origBounds.width;
  const bh = origBounds.height;

  let dw = 0;
  let dh = 0;
  let dx = 0;
  let dy = 0;

  switch (handle) {
    case 'br': dw = canvasDeltaX; dh = canvasDeltaY; break;
    case 'bl': dw = -canvasDeltaX; dh = canvasDeltaY; dx = canvasDeltaX; break;
    case 'tr': dw = canvasDeltaX; dh = -canvasDeltaY; dy = canvasDeltaY; break;
    case 'tl': dw = -canvasDeltaX; dh = -canvasDeltaY; dx = canvasDeltaX; dy = canvasDeltaY; break;
    case 'r': dw = canvasDeltaX; break;
    case 'l': dw = -canvasDeltaX; dx = canvasDeltaX; break;
    case 'b': dh = canvasDeltaY; break;
    case 't': dh = -canvasDeltaY; dy = canvasDeltaY; break;
  }

  const newScaleX = Math.max(MIN_SCALE, origScaleX * (bw + dw) / bw);
  const newScaleY = Math.max(MIN_SCALE, origScaleY * (bh + dh) / bh);

  const result: { scaleX: number; scaleY: number; x?: number; y?: number } = {
    scaleX: newScaleX,
    scaleY: newScaleY,
  };
  if (dx !== 0) result.x = origBounds.x + dx;
  if (dy !== 0) result.y = origBounds.y + dy;

  return result;
}

interface CanvasAdornerProps {
  elements: CanvasElement[];
  selectedId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: (id: string | null) => void;
  dispatch: React.Dispatch<CanvasAction>;
}

export default function CanvasAdorner({
  elements,
  selectedId,
  canvasWidth,
  canvasHeight,
  onSelect,
  dispatch,
}: CanvasAdornerProps) {
  const adornerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const selectedEl = elements.find((el) => el.id === selectedId) ?? null;
  const selectedBounds = selectedEl ? getElementBounds(selectedEl) : null;

  // Express selection box in percentages so no DOM measurements are needed during render
  const selectionStyle = selectedBounds
    ? {
      left: `${(selectedBounds.x / canvasWidth) * 100}%`,
      top: `${(selectedBounds.y / canvasHeight) * 100}%`,
      width: `${(selectedBounds.width / canvasWidth) * 100}%`,
      height: `${(selectedBounds.height / canvasHeight) * 100}%`,
    }
    : null;

  function getScaleFactor(): number {
    const el = adornerRef.current;
    if (!el || canvasWidth === 0) return 1;
    return el.offsetWidth / canvasWidth;
  }

  function toCanvasCoords(screenX: number, screenY: number): { cx: number; cy: number } {
    const rect = adornerRef.current!.getBoundingClientRect();
    const sf = getScaleFactor();
    return { cx: (screenX - rect.left) / sf, cy: (screenY - rect.top) / sf };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return;

    const handleTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');

    if (handleTarget && selectedEl) {
      const handle = handleTarget.dataset.handle as HandleId;
      const bounds = getElementBounds(selectedEl);
      dragRef.current = {
        type: 'scaling',
        elementId: selectedEl.id,
        handle,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        origBounds: bounds,
        origScaleX: selectedEl.scaleX,
        origScaleY: selectedEl.scaleY,
      };
      adornerRef.current!.setPointerCapture(e.pointerId);
      e.stopPropagation();
      return;
    }

    const { cx, cy } = toCanvasCoords(e.clientX, e.clientY);
    const hitId = hitTest(elements, cx, cy);

    if (hitId) {
      onSelect(hitId);
      const el = elements.find((el) => el.id === hitId)!;
      dragRef.current = {
        type: 'moving',
        elementId: hitId,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        origX: el.x,
        origY: el.y,
      };
      adornerRef.current!.setPointerCapture(e.pointerId);
    } else {
      onSelect(null);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;

    const sf = getScaleFactor();
    const canvasDeltaX = (e.clientX - drag.startScreenX) / sf;
    const canvasDeltaY = (e.clientY - drag.startScreenY) / sf;

    if (drag.type === 'moving') {
      dispatch({
        type: 'MOVE_ELEMENT',
        id: drag.elementId,
        x: drag.origX + canvasDeltaX,
        y: drag.origY + canvasDeltaY,
      });
    } else {
      const result = applyScaleHandle(
        drag.handle,
        canvasDeltaX,
        canvasDeltaY,
        drag.origBounds,
        drag.origScaleX,
        drag.origScaleY,
      );
      dispatch({
        type: 'UPDATE_ELEMENT',
        id: drag.elementId,
        patch: {
          scaleX: result.scaleX,
          scaleY: result.scaleY,
          ...(result.x !== undefined && { x: result.x }),
          ...(result.y !== undefined && { y: result.y }),
        },
      });
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current) {
      adornerRef.current?.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }

  return (
    <div
      ref={adornerRef}
      data-testid="canvas-adorner"
      className="canvas-adorner"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {selectionStyle && (
        <div className="canvas-adorner__selection" style={selectionStyle}>
          {HANDLES.map((h) => (
            <div
              key={h}
              data-handle={h}
              className={`canvas-adorner__handle canvas-adorner__handle--${h}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
