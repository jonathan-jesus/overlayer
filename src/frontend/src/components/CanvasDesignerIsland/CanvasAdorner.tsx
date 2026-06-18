import { useRef, useState, useEffect, useCallback } from 'react';
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
    if (el.visible === false) continue;
    const b = getElementBounds(el);
    if (cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height) {
      return el.id;
    }
  }
  return null;
}

function calculateRawDelta(handle: HandleId, canvasDeltaX: number, canvasDeltaY: number) {
  let dw = 0;
  let dh = 0;
  switch (handle) {
    case 'br': dw = canvasDeltaX; dh = canvasDeltaY; break;
    case 'bl': dw = -canvasDeltaX; dh = canvasDeltaY; break;
    case 'tr': dw = canvasDeltaX; dh = -canvasDeltaY; break;
    case 'tl': dw = -canvasDeltaX; dh = -canvasDeltaY; break;
    case 'r': dw = canvasDeltaX; break;
    case 'l': dw = -canvasDeltaX; break;
    case 'b': dh = canvasDeltaY; break;
    case 't': dh = -canvasDeltaY; break;
  }
  return { dw, dh };
}

function adjustForAspectRatio(
  handle: HandleId,
  keepProportions: boolean,
  bw: number,
  bh: number,
  dw: number,
  dh: number,
  canvasDeltaX: number,
  canvasDeltaY: number
) {
  let adjDw = dw;
  let adjDh = dh;
  const isCorner = ['tl', 'tr', 'bl', 'br'].includes(handle);
  if (keepProportions && isCorner) {
    const sx = (bw + dw) / bw;
    const sy = (bh + dh) / bh;
    const s = Math.abs(canvasDeltaX) > Math.abs(canvasDeltaY) ? sx : sy;
    adjDw = bw * s - bw;
    adjDh = bh * s - bh;
  }
  return { dw: adjDw, dh: adjDh };
}

function calculateOffsets(handle: HandleId, dw: number, dh: number) {
  let dx = 0;
  let dy = 0;
  if (['tl', 'bl', 'l'].includes(handle)) {
    dx = -dw;
  }
  if (['tl', 'tr', 't'].includes(handle)) {
    dy = -dh;
  }
  return { dx, dy };
}

function applyScaleHandle(
  handle: HandleId,
  canvasDeltaX: number,
  canvasDeltaY: number,
  origBounds: BoundingBox,
  origScaleX: number,
  origScaleY: number,
  keepProportions: boolean,
): { scaleX: number; scaleY: number; x?: number; y?: number } {
  const MIN_SCALE = 0.05;
  const bw = origBounds.width;
  const bh = origBounds.height;

  const raw = calculateRawDelta(handle, canvasDeltaX, canvasDeltaY);

  const adjusted = adjustForAspectRatio(handle, keepProportions, bw, bh, raw.dw, raw.dh, canvasDeltaX, canvasDeltaY);

  const offset = calculateOffsets(handle, adjusted.dw, adjusted.dh);

  const newScaleX = Math.max(MIN_SCALE, origScaleX * (bw + adjusted.dw) / bw);
  const newScaleY = Math.max(MIN_SCALE, origScaleY * (bh + adjusted.dh) / bh);

  const result: { scaleX: number; scaleY: number; x?: number; y?: number } = {
    scaleX: newScaleX,
    scaleY: newScaleY,
  };
  if (offset.dx !== 0) result.x = origBounds.x + offset.dx;
  if (offset.dy !== 0) result.y = origBounds.y + offset.dy;

  return result;
}

interface CanvasAdornerProps {
  elements: CanvasElement[];
  selectedId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: (id: string | null) => void;
  editingId?: string | null;
  onEditingChange: (id: string | null) => void;
  dispatch: React.Dispatch<CanvasAction>;
  keepProportions: boolean;
  zoomScale: number;
  onBackgroundPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export default function CanvasAdorner({
  elements,
  selectedId,
  canvasWidth,
  canvasHeight,
  onSelect,
  editingId = null,
  onEditingChange,
  dispatch,
  keepProportions,
  zoomScale,
  onBackgroundPointerDown,
}: CanvasAdornerProps) {
  const adornerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [scaleFactor, setScaleFactor] = useState(1);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    const el = adornerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (canvasWidth > 0) {
        setScaleFactor(el.offsetWidth / canvasWidth);
      }
    });
    observer.observe(el);
    if (canvasWidth > 0) {
      setScaleFactor(el.offsetWidth / canvasWidth);
    }
    return () => observer.disconnect();
  }, [canvasWidth]);

  const selectedEl = elements.find((el) => el.id === selectedId) ?? null;
  const selectedBounds = selectedEl && selectedEl.visible !== false ? getElementBounds(selectedEl) : null;

  const isEditing = editingId !== null && editingId === selectedId;

  // Express selection box in percentages so no DOM measurements are needed during render
  const selectionStyle = selectedBounds
    ? {
      left: `${(selectedBounds.x / canvasWidth) * 100}%`,
      top: `${(selectedBounds.y / canvasHeight) * 100}%`,
      width: `${(selectedBounds.width / canvasWidth) * 100}%`,
      height: `${(selectedBounds.height / canvasHeight) * 100}%`,
    }
    : null;

  const getScaleFactor = useCallback((): number => {
    const el = adornerRef.current;
    if (!el || canvasWidth === 0) return 1;
    return el.offsetWidth / canvasWidth;
  }, [canvasWidth]);

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
      lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
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
      onBackgroundPointerDown?.(e);
    }
  }

  const updateScaling = useCallback((clientX: number, clientY: number): void => {
    const drag = dragRef.current;
    if (!drag || drag.type !== 'scaling') return;

    const sf = getScaleFactor();
    const canvasDeltaX = (clientX - drag.startScreenX) / sf;
    const canvasDeltaY = (clientY - drag.startScreenY) / sf;

    const result = applyScaleHandle(
      drag.handle,
      canvasDeltaX,
      canvasDeltaY,
      drag.origBounds,
      drag.origScaleX,
      drag.origScaleY,
      keepProportions,
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
  }, [dispatch, getScaleFactor, keepProportions]);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.type === 'moving') {
      const sf = getScaleFactor();
      const canvasDeltaX = (e.clientX - drag.startScreenX) / sf;
      const canvasDeltaY = (e.clientY - drag.startScreenY) / sf;
      dispatch({
        type: 'MOVE_ELEMENT',
        id: drag.elementId,
        x: drag.origX + canvasDeltaX,
        y: drag.origY + canvasDeltaY,
      });
    } else {
      lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
      updateScaling(e.clientX, e.clientY);
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current) {
      adornerRef.current?.releasePointerCapture(e.pointerId);
      dragRef.current = null;
      lastPointerRef.current = null;
    }
  }

  useEffect(() => {
    if (dragRef.current && dragRef.current.type === 'scaling' && lastPointerRef.current) {
      updateScaling(lastPointerRef.current.clientX, lastPointerRef.current.clientY);
    }
  }, [keepProportions, updateScaling]);

  function handleDoubleClick(e: React.MouseEvent<HTMLDivElement>): void {
    const { cx, cy } = toCanvasCoords(e.clientX, e.clientY);
    const hitId = hitTest(elements, cx, cy);
    if (hitId && hitId === selectedId) {
      const el = elements.find((el) => el.id === hitId);
      if (el && el.kind === 'text') {
        onEditingChange(el.id);
      }
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
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="canvas-adorner__hit-area"
        style={{
          top: `${-1000 * zoomScale}px`,
          left: `${-1000 * zoomScale}px`,
          width: `${(canvasWidth + 2000) * zoomScale}px`,
          height: `${(canvasHeight + 2000) * zoomScale}px`,
        }}
      />
      {selectionStyle && (
        <div className="canvas-adorner__selection" style={selectionStyle}>
          {isEditing && selectedEl?.kind === 'text' ? (
            <textarea
              className="canvas-adorner__text-input"
              autoFocus
              value={selectedEl.text}
              style={{
                fontFamily: `"${selectedEl.font}", sans-serif`,
                fontSize: `${selectedEl.fontSize * selectedEl.scaleY * (scaleFactor || 1)}px`,
                color: selectedEl.fill,
                lineHeight: 1,
                background: 'transparent',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                dispatch({
                  type: 'UPDATE_ELEMENT',
                  id: selectedEl.id,
                  patch: { text: e.target.value },
                });
              }}
              onBlur={() => {
                onEditingChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            HANDLES.map((h) => (
              <div
                key={h}
                data-handle={h}
                className={`canvas-adorner__handle canvas-adorner__handle--${h}`}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
