import { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { uploadFile } from '../../upload/s3UploadService';
import type { UploadState } from '../../upload/uploadTypes';
import { canvasReducer } from './canvasReducer';
import type { CanvasElement, Shadow } from './canvasReducer';
import LayerPanel from './LayerPanel';
import CanvasAdorner from './CanvasAdorner';
import PropertiesPanel from './PropertiesPanel';
import { TypeIcon, SquareIcon, ImageIcon, UploadIcon, SpinnerIcon, PropertiesIcon, ChevronRightIcon, ZoomOutIcon, ZoomInIcon, ZoomToFitIcon } from './icons';
import './EditorLayout.css';
import './CanvasDesignerIsland.css';

interface CanvasDesignerIslandProps {
  overlayPresignedUpload: PresignedUpload | null;
  onOverlayUploaded: () => void;
}

interface CanvasConfig {
  width: number;
  height: number;
}

const DEFAULT_CANVAS: CanvasConfig = { width: 1920, height: 1080 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.0;
const CANVAS_PADDING = 1000;

export function isValidDimension(w: number, h: number): boolean {
  if (!Number.isInteger(w) || !Number.isInteger(h)) return false;
  if (w < 1 || h < 1 || w > 1920 || h > 1920) return false;
  if (w >= h) return h <= 1080;
  return w <= 1080;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function applyElementShadow(ctx: CanvasRenderingContext2D, shadow: Shadow): void {
  if (shadow.distance === 0 && shadow.blur === 0) return;
  const rad = (shadow.angle * Math.PI) / 180;
  const [r, g, b] = hexToRgb(shadow.color);
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${shadow.opacity / 100})`;
  ctx.shadowBlur = shadow.blur;
  ctx.shadowOffsetX = Math.cos(rad) * shadow.distance;
  ctx.shadowOffsetY = Math.sin(rad) * shadow.distance;
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  imageCache: Map<string, HTMLImageElement>,
  onImageLoad: () => void,
): void {
  ctx.save();
  ctx.globalAlpha = el.opacity / 100;
  applyElementShadow(ctx, el.shadow);
  ctx.translate(el.x, el.y);
  ctx.rotate((el.rotation * Math.PI) / 180);

  switch (el.kind) {
    case 'text': {
      ctx.scale(el.scaleX, el.scaleY);
      ctx.font = `${el.fontSize}px "${el.font}", sans-serif`;
      ctx.fillStyle = el.fill;
      ctx.fillText(el.text, 0, el.fontSize);
      break;
    }
    case 'rect': {
      const w = el.width * el.scaleX;
      const h = el.height * el.scaleY;
      ctx.fillStyle = el.fill;
      ctx.fillRect(0, 0, w, h);
      if (el.strokeWidth > 0) {
        // Clear shadow so the stroke doesn't cast a separate shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = el.stroke;

        if (el.strokeAlign === 'center') {
          ctx.lineWidth = el.strokeWidth;
          ctx.strokeRect(0, 0, w, h);
        } else if (el.strokeAlign === 'inside') {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
          ctx.clip();
          ctx.lineWidth = el.strokeWidth * 2;
          ctx.strokeRect(0, 0, w, h);
          ctx.restore();
        } else {
          // outside
          ctx.save();
          ctx.beginPath();
          ctx.rect(
            -el.strokeWidth, -el.strokeWidth,
            w + el.strokeWidth * 2, h + el.strokeWidth * 2,
          );
          ctx.rect(0, 0, w, h);
          ctx.clip('evenodd');
          ctx.lineWidth = el.strokeWidth * 2;
          ctx.strokeRect(0, 0, w, h);
          ctx.restore();
        }
      }
      break;
    }
    case 'image': {
      const w = el.width * el.scaleX;
      const h = el.height * el.scaleY;
      const cached = imageCache.get(el.src);
      if (cached?.complete) {
        ctx.drawImage(cached, 0, 0, w, h);
      } else if (!cached) {
        const img = new Image();
        img.addEventListener('load', onImageLoad, { once: true });
        img.src = el.src;
        imageCache.set(el.src, img);
      }
      break;
    }
  }

  ctx.restore();
}

export default function CanvasDesignerIsland({
  overlayPresignedUpload,
  onOverlayUploaded,
}: CanvasDesignerIslandProps) {
  const [elements, dispatch] = useReducer(canvasReducer, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>(DEFAULT_CANVAS);
  const [widthInput, setWidthInput] = useState(String(DEFAULT_CANVAS.width));
  const [heightInput, setHeightInput] = useState(String(DEFAULT_CANVAS.height));
  const [keepCanvasProportions, setKeepCanvasProportions] = useState(false);
  const [isLayersOpen, setIsLayersOpen] = useState(true);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keepProportions, setKeepProportions] = useState(true);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

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

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  );

  const [zoomScale, setZoomScale] = useState(1);
  const [zoomInput, setZoomInput] = useState('100%');
  const [isZoomInputFocused, setIsZoomInputFocused] = useState(false);
  const [isClipToCanvas, setIsClipToCanvas] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isZoomInputFocused) {
      setZoomInput(`${Math.round(zoomScale * 100)}%`);
    }
  }, [zoomScale, isZoomInputFocused]);

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
  }, [canvasConfig.width, canvasConfig.height]);

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
  }, []);

  const handleZoomOut = useCallback(() => {
    applyZoomAtCenter((prev) => prev - 0.1);
  }, [applyZoomAtCenter]);

  const handleZoomIn = useCallback(() => {
    applyZoomAtCenter((prev) => prev + 0.1);
  }, [applyZoomAtCenter]);

  const commitZoomInput = useCallback(() => {
    const cleanVal = zoomInput.replace('%', '').trim();
    const pct = parseFloat(cleanVal);
    if (!Number.isNaN(pct)) {
      applyZoomAtCenter(() => pct / 100);
    } else {
      setZoomInput(`${Math.round(zoomScale * 100)}%`);
    }
  }, [zoomInput, zoomScale, applyZoomAtCenter]);

  const handleZoomKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitZoomInput();
      e.currentTarget.blur();
    }
  }, [commitZoomInput]);

  const handleZoomInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setZoomInput(e.target.value);
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
  }, []);

  function startPanning(e: React.PointerEvent) {
    setIsPanning(true);
    setLastPanPoint({ x: e.clientX, y: e.clientY });
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function handleViewportPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button === 1) {
      zoomToFit();
      e.preventDefault();
      return;
    }
    if (e.button === 0 && e.target === viewportRef.current) {
      startPanning(e);
    }
  }

  function handleViewportPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (isPanning) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  }

  function handleViewportPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isPanning) {
      setIsPanning(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const effectiveKeepProportions = isShiftPressed ? !keepProportions : keepProportions;

  useEffect(() => {
    setEditingId(null);
  }, [selectedId]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const latestDrawRef = useRef<() => void>(() => { });

  const isLocked = overlayPresignedUpload === null;

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
  }, [elements, isLocked, canvasConfig, editingId]);

  const pendingW = parseInt(widthInput, 10);
  const pendingH = parseInt(heightInput, 10);
  const isDimensionValid = isValidDimension(pendingW, pendingH);

  function commitDimension(): void {
    if (isValidDimension(pendingW, pendingH)) {
      setCanvasConfig({ width: pendingW, height: pendingH });
    }
  }

  function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        dispatch({
          type: 'ADD_IMAGE',
          src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          x: canvasConfig.width / 2 - img.naturalWidth / 2,
          y: canvasConfig.height / 2 - img.naturalHeight / 2
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleUpload(): Promise<void> {
    if (!overlayPresignedUpload) return;
    setUploadState('uploading');
    setErrorMessage(null);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvasConfig.width;
    exportCanvas.height = canvasConfig.height;
    const exportCtx = exportCanvas.getContext('2d');

    if (!exportCtx) {
      setErrorMessage('Upload failed. Could not render canvas.');
      setUploadState('error');
      return;
    }

    for (const el of elements) {
      if (el.visible === false) continue;
      drawElement(exportCtx, el, imageCache.current, () => { });
    }

    exportCanvas.toBlob(async (blob) => {
      if (!blob) {
        setErrorMessage('Upload failed. Could not render canvas.');
        setUploadState('error');
        return;
      }
      try {
        const file = new File([blob], 'overlay.png', { type: 'image/png' });
        await uploadFile(overlayPresignedUpload, file);
        setUploadState('done');
        onOverlayUploaded();
      } catch {
        setErrorMessage('Upload failed. Please try again.');
        setUploadState('error');
      }
    }, 'image/png');
  }

  return (
    <section
      className={`canvas-designer ${isLocked ? 'canvas-designer--locked' : ''}`}
      aria-label="Canvas designer"
      aria-disabled={isLocked ? 'true' : undefined}
    >
      <div className="canvas-designer__toolbar">
        <div className="canvas-designer__creation-tools">
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--icon"
            onClick={() => dispatch({ type: 'ADD_TEXT', x: canvasConfig.width / 2 - 40, y: canvasConfig.height / 2 - 16 })}
            disabled={isLocked || uploadState === 'uploading'}
            aria-label="Text"
          >
            <TypeIcon />
          </button>
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--icon"
            onClick={() => dispatch({ type: 'ADD_RECT', x: canvasConfig.width / 2 - 100, y: canvasConfig.height / 2 - 50 })}
            disabled={isLocked || uploadState === 'uploading'}
            aria-label="Rectangle"
          >
            <SquareIcon />
          </button>
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--icon"
            onClick={() => imageInputRef.current?.click()}
            disabled={isLocked || uploadState === 'uploading'}
            aria-label="Image"
          >
            <ImageIcon />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg"
            className="canvas-designer__file-input"
            onChange={handleImageFileChange}
            aria-label="Upload image file"
          />
        </div>

        <div className="canvas-designer__separator" aria-hidden="true" />

        <div className="canvas-designer__zoom-controls">
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--icon"
            onClick={handleZoomOut}
            aria-label="Zoom out"
          >
            <ZoomOutIcon />
          </button>
          <input
            type="text"
            className="canvas-designer__zoom-value"
            value={zoomInput}
            onChange={handleZoomInputChange}
            onFocus={() => setIsZoomInputFocused(true)}
            onBlur={() => {
              setIsZoomInputFocused(false);
              commitZoomInput();
            }}
            onKeyDown={handleZoomKeyDown}
            aria-label="Current zoom level"
          />
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--icon"
            onClick={handleZoomIn}
            aria-label="Zoom in"
          >
            <ZoomInIcon />
          </button>
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--icon"
            onClick={zoomToFit}
            aria-label="Zoom to fit"
          >
            <ZoomToFitIcon />
          </button>
        </div>

        {!isLocked && (
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--primary canvas-designer__btn--with-icon canvas-designer__btn--upload"
            onClick={handleUpload}
            disabled={uploadState === 'uploading' || uploadState === 'done'}
          >
            {uploadState === 'uploading' ? <SpinnerIcon /> : <UploadIcon />}
            <span>{uploadState === 'uploading' ? 'Uploading…' : 'Upload'}</span>
          </button>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="canvas-designer__error">
          {errorMessage}
        </p>
      )}

      <div className={`editor-layout${!isLayersOpen ? ' editor-layout--collapsed-layers' : ''}${!isPropertiesOpen ? ' editor-layout--collapsed-properties' : ''}`}>
        <div className="editor-layout__layers">
          <LayerPanel
            elements={elements}
            selectedId={selectedId}
            onSelect={setSelectedId}
            dispatch={dispatch}
            isOpen={isLayersOpen}
            onToggle={() => setIsLayersOpen(!isLayersOpen)}
          />
        </div>

        <div className="editor-layout__canvas-area">
          <div
            ref={viewportRef}
            className={`canvas-designer__viewport${isPanning ? ' canvas-designer__viewport--panning' : ''}`}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={handleViewportPointerUp}
          >
            <div
              className="canvas-designer__pan-container"
              style={{
                width: `${canvasConfig.width * zoomScale}px`,
                height: `${canvasConfig.height * zoomScale}px`,
                transform: `translate(${pan.x}px, ${pan.y}px)`
              }}
            >
              <div
                className={`canvas-designer__canvas-wrapper${isClipToCanvas ? ' canvas-designer__canvas-wrapper--clipped' : ''}`}
              >
                {isLocked && (
                  <div className="canvas-designer__lock-overlay" aria-hidden="true">
                    <span className="canvas-designer__lock-icon">🔒</span>
                    <p>Upload a video first to enable the canvas designer</p>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  className="canvas-designer__canvas"
                  width={canvasConfig.width + CANVAS_PADDING * 2}
                  height={canvasConfig.height + CANVAS_PADDING * 2}
                  style={{
                    position: 'absolute',
                    top: `${-CANVAS_PADDING * zoomScale}px`,
                    left: `${-CANVAS_PADDING * zoomScale}px`,
                    width: `${(canvasConfig.width + CANVAS_PADDING * 2) * zoomScale}px`,
                    height: `${(canvasConfig.height + CANVAS_PADDING * 2) * zoomScale}px`,
                  }}
                  aria-label="Overlay canvas"
                />
                {!isLocked && (
                  <CanvasAdorner
                    elements={elements}
                    selectedId={selectedId}
                    canvasWidth={canvasConfig.width}
                    canvasHeight={canvasConfig.height}
                    onSelect={setSelectedId}
                    editingId={editingId}
                    onEditingChange={setEditingId}
                    dispatch={dispatch}
                    keepProportions={effectiveKeepProportions}
                    zoomScale={zoomScale}
                    onBackgroundPointerDown={startPanning}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="editor-layout__inspector">
          <aside
            className={`inspector-panel ${!isPropertiesOpen ? 'inspector-panel--collapsed' : ''}`}
            aria-label="Properties"
          >
            <div className="inspector-panel__header">
              {isPropertiesOpen ? (
                <>
                  <div className="inspector-panel__header-title">
                    <PropertiesIcon />
                    <h3 className="inspector-panel__title">Properties</h3>
                  </div>
                  <button
                    type="button"
                    className="inspector-panel__toggle-btn"
                    onClick={() => setIsPropertiesOpen(!isPropertiesOpen)}
                    aria-label="Collapse Properties panel"
                  >
                    <ChevronRightIcon />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="inspector-panel__toggle-btn inspector-panel__toggle-btn--collapsed"
                  onClick={() => setIsPropertiesOpen(!isPropertiesOpen)}
                  aria-label="Expand Properties panel"
                >
                  <PropertiesIcon />
                </button>
              )}
            </div>
            {isPropertiesOpen && (
              <PropertiesPanel
                selectedElement={selectedElement}
                dispatch={dispatch}
                keepProportions={keepProportions}
                effectiveKeepProportions={effectiveKeepProportions}
                onKeepProportionsChange={setKeepProportions}
                widthInput={widthInput}
                heightInput={heightInput}
                setWidthInput={handleWidthInputChange}
                setHeightInput={handleHeightInputChange}
                commitDimension={commitDimension}
                isDimensionValid={isDimensionValid}
                isClipToCanvas={isClipToCanvas}
                setIsClipToCanvas={setIsClipToCanvas}
                keepCanvasProportions={keepCanvasProportions}
                setKeepCanvasProportions={setKeepCanvasProportions}
              />
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
