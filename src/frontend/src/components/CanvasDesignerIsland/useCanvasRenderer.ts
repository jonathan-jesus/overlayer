import { useEffect, useRef, type RefObject } from 'react';
import type { CanvasElement } from './canvasReducer';
import { drawElement } from './canvasRenderer';
import type { CanvasConfig } from './useCanvasConfig';

const CANVAS_PADDING = 1000;

export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  elements: CanvasElement[],
  isLocked: boolean,
  canvasConfig: CanvasConfig,
  editingId: string | null,
  imageCache: RefObject<Map<string, HTMLImageElement>>,
): void {
  const latestDrawRef = useRef<() => void>(() => { });

  useEffect(() => {
    if (isLocked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      ctx!.clearRect(0, 0, canvasConfig.width + CANVAS_PADDING * 2, canvasConfig.height + CANVAS_PADDING * 2);
      ctx!.save();
      ctx!.translate(CANVAS_PADDING, CANVAS_PADDING);
      for (const el of elements) {
        if (el.id === editingId || el.visible === false) continue;
        drawElement(ctx!, el, imageCache.current, () => latestDrawRef.current());
      }
      ctx!.restore();
    }

    latestDrawRef.current = draw;
    draw();
  }, [elements, isLocked, canvasConfig, editingId, canvasRef, imageCache]);
}

export { CANVAS_PADDING };
