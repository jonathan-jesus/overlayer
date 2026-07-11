import { useState, type RefObject, type Dispatch, type SetStateAction } from 'react';

type PanState = { x: number; y: number };

interface ViewportPointerHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export interface UsePanResult {
  isPanning: boolean;
  startPanning: (e: React.PointerEvent) => void;
  viewportPointerHandlers: ViewportPointerHandlers;
}

export function usePan(
  viewportRef: RefObject<HTMLDivElement | null>,
  setPan: Dispatch<SetStateAction<PanState>>,
  onMiddleClick: () => void,
): UsePanResult {
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  function startPanning(e: React.PointerEvent) {
    setIsPanning(true);
    setLastPanPoint({ x: e.clientX, y: e.clientY });
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button === 1) {
      onMiddleClick();
      e.preventDefault();
      return;
    }
    if (e.button === 0 && e.target === viewportRef.current) {
      startPanning(e);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (isPanning) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isPanning) {
      setIsPanning(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return {
    isPanning,
    startPanning,
    viewportPointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
  };
}
