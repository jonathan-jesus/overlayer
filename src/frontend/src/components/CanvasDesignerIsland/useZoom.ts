import { useState, useEffect, useCallback, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { CanvasConfig } from './useCanvasConfig';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.0;

type PanState = { x: number; y: number };

export interface UseZoomResult {
  zoomScale: number;
  zoomInput: string;
  isZoomInputFocused: boolean;
  zoomToFit: () => void;
  applyZoomAtCenter: (updater: (prev: number) => number) => void;
  handleZoomOut: () => void;
  handleZoomIn: () => void;
  handleZoomInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleZoomKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onZoomInputFocus: () => void;
  onZoomInputBlur: () => void;
}

export function useZoom(
  viewportRef: RefObject<HTMLDivElement | null>,
  canvasConfig: CanvasConfig,
  setPan: Dispatch<SetStateAction<PanState>>,
): UseZoomResult {
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomInputDraft, setZoomInputDraft] = useState('');
  const [isZoomInputFocused, setIsZoomInputFocused] = useState(false);

  const zoomInput = isZoomInputFocused ? zoomInputDraft : `${Math.round(zoomScale * 100)}%`;

  const zoomToFit = useCallback(() => {
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const marginX = 320;
      const marginY = 40;
      const fitW = (rect.width - marginX) / canvasConfig.width;
      const fitH = (rect.height - marginY) / canvasConfig.height;
      const initialZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(fitW, fitH, 1)));
      setZoomScale(initialZoom);
      setPan({
        x: (rect.width - canvasConfig.width * initialZoom) / 2,
        y: (rect.height - canvasConfig.height * initialZoom) / 2,
      });
    }
  }, [viewportRef, canvasConfig.width, canvasConfig.height, setPan]);

  const applyZoomAtCenter = useCallback((zoomUpdater: (prev: number) => number) => {
    setZoomScale((prev) => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomUpdater(prev)));
      if (viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        setPan((prevPan) => {
          const scaleRatio = newZoom / prev;
          return {
            x: centerX - (centerX - prevPan.x) * scaleRatio,
            y: centerY - (centerY - prevPan.y) * scaleRatio,
          };
        });
      }
      return newZoom;
    });
  }, [viewportRef, setPan]);

  const handleZoomOut = useCallback(() => {
    applyZoomAtCenter((prev) => prev - 0.1);
  }, [applyZoomAtCenter]);

  const handleZoomIn = useCallback(() => {
    applyZoomAtCenter((prev) => prev + 0.1);
  }, [applyZoomAtCenter]);

  const commitZoomInput = useCallback(() => {
    const cleanVal = zoomInputDraft.replace('%', '').trim();
    const pct = parseFloat(cleanVal);
    if (!Number.isNaN(pct)) {
      applyZoomAtCenter(() => pct / 100);
    }
  }, [zoomInputDraft, applyZoomAtCenter]);

  const handleZoomKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitZoomInput();
      e.currentTarget.blur();
    }
  }, [commitZoomInput]);

  const handleZoomInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setZoomInputDraft(e.target.value);
  }, []);

  useEffect(() => {
    const timer = setTimeout(zoomToFit, 10);
    return () => clearTimeout(timer);
  }, [zoomToFit]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomStep = 0.1;
      const delta = e.deltaY < 0 ? zoomStep : -zoomStep;

      setZoomScale((prev) => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setPan((prevPan) => {
          const scaleRatio = newZoom / prev;
          return {
            x: mouseX - (mouseX - prevPan.x) * scaleRatio,
            y: mouseY - (mouseY - prevPan.y) * scaleRatio,
          };
        });
        return newZoom;
      });
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [viewportRef, setPan]);

  return {
    zoomScale,
    zoomInput,
    isZoomInputFocused,
    zoomToFit,
    applyZoomAtCenter,
    handleZoomOut,
    handleZoomIn,
    handleZoomInputChange,
    handleZoomKeyDown,
    onZoomInputFocus: () => {
      setZoomInputDraft(`${Math.round(zoomScale * 100)}%`);
      setIsZoomInputFocused(true);
    },
    onZoomInputBlur: () => {
      setIsZoomInputFocused(false);
      commitZoomInput();
    },
  };
}
