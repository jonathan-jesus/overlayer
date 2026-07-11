import { useState, useCallback } from 'react';
import { isValidDimension } from './canvasRenderer';

export interface CanvasConfig {
  width: number;
  height: number;
}

const DEFAULT_CANVAS: CanvasConfig = { width: 1920, height: 1080 };

export interface UseCanvasConfigResult {
  canvasConfig: CanvasConfig;
  widthInput: string;
  heightInput: string;
  keepCanvasProportions: boolean;
  setKeepCanvasProportions: (val: boolean) => void;
  handleWidthInputChange: (val: string) => void;
  handleHeightInputChange: (val: string) => void;
  commitDimension: () => void;
  isDimensionValid: boolean;
}

export function useCanvasConfig(): UseCanvasConfigResult {
  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>(DEFAULT_CANVAS);
  const [widthInput, setWidthInput] = useState(String(DEFAULT_CANVAS.width));
  const [heightInput, setHeightInput] = useState(String(DEFAULT_CANVAS.height));
  const [keepCanvasProportions, setKeepCanvasProportions] = useState(false);

  const handleWidthInputChange = useCallback((val: string) => {
    setWidthInput(val);
    if (keepCanvasProportions) {
      const w = parseInt(val, 10);
      if (!Number.isNaN(w) && w > 0 && canvasConfig.width > 0) {
        const ratio = canvasConfig.height / canvasConfig.width;
        setHeightInput(String(Math.round(w * ratio)));
      }
    }
  }, [keepCanvasProportions, canvasConfig.width, canvasConfig.height]);

  const handleHeightInputChange = useCallback((val: string) => {
    setHeightInput(val);
    if (keepCanvasProportions) {
      const h = parseInt(val, 10);
      if (!Number.isNaN(h) && h > 0 && canvasConfig.height > 0) {
        const ratio = canvasConfig.width / canvasConfig.height;
        setWidthInput(String(Math.round(h * ratio)));
      }
    }
  }, [keepCanvasProportions, canvasConfig.width, canvasConfig.height]);

  const pendingW = parseInt(widthInput, 10);
  const pendingH = parseInt(heightInput, 10);
  const isDimensionValid = isValidDimension(pendingW, pendingH);

  const commitDimension = useCallback(() => {
    if (isValidDimension(pendingW, pendingH)) {
      setCanvasConfig({ width: pendingW, height: pendingH });
    }
  }, [pendingW, pendingH]);

  return {
    canvasConfig,
    widthInput,
    heightInput,
    keepCanvasProportions,
    setKeepCanvasProportions,
    handleWidthInputChange,
    handleHeightInputChange,
    commitDimension,
    isDimensionValid,
  };
}
