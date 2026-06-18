import { useReducer, useEffect, useRef, useState, useCallback } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { uploadFile } from '../../upload/s3UploadService';
import type { UploadState } from '../../upload/uploadTypes';
import { canvasReducer } from './canvasReducer';
import type { CanvasElement, Shadow } from './canvasReducer';
import LayerPanel from './LayerPanel';
import CanvasAdorner from './CanvasAdorner';
import { TypeIcon, SquareIcon, ImageIcon, UploadIcon, SpinnerIcon, PropertiesIcon, LockIcon, UnlockIcon, ChevronRightIcon } from './icons';
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
const CANVAS_PADDING = 1000;

export function isValidDimension(w: number, h: number): boolean {
  if (!Number.isInteger(w) || !Number.isInteger(h)) return false;
  if (w < 1 || h < 1 || w > 1920 || h > 1920) return false;
  if (w >= h) return h <= 1080;
  return w <= 1080;
}

function applyElementShadow(ctx: CanvasRenderingContext2D, shadow: Shadow): void {
  if (shadow.distance === 0 && shadow.blur === 0) return;
  const rad = (shadow.angle * Math.PI) / 180;
  ctx.shadowColor = shadow.color;
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
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.strokeRect(0, 0, w, h);
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
  const [isLayersOpen, setIsLayersOpen] = useState(true);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keepProportions, setKeepProportions] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  const [zoomScale, setZoomScale] = useState(1);
  const [isClipToCanvas, setIsClipToCanvas] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const zoomToFit = useCallback(() => {
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const marginX = 320;
      const marginY = 40;
      const fitW = (rect.width - marginX) / canvasConfig.width;
      const fitH = (rect.height - marginY) / canvasConfig.height;
      const initialZoom = Math.min(fitW, fitH, 1);
      setZoomScale(initialZoom);
      setPan({
        x: (rect.width - canvasConfig.width * initialZoom) / 2,
        y: (rect.height - canvasConfig.height * initialZoom) / 2,
      });
    }
  }, [canvasConfig.width, canvasConfig.height]);

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
        const newZoom = Math.max(0.1, Math.min(5.0, prev + delta));
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

  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setEditingId(null);
  }

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

        {selectedId !== null && (
          <div className="canvas-designer__proportions">
            <label className="canvas-designer__prop-label">
              <input
                type="checkbox"
                className="canvas-designer__prop-checkbox"
                checked={effectiveKeepProportions}
                onChange={(e) => setKeepProportions(e.target.checked)}
              />
              {effectiveKeepProportions ? <LockIcon /> : <UnlockIcon />}
              <span>Keep proportions</span>
            </label>
          </div>
        )}

        <div className="canvas-designer__dimensions">
          <label className="canvas-designer__dim-label" htmlFor="canvas-width">W</label>
          <input
            id="canvas-width"
            type="number"
            className={`canvas-designer__dim-input${!isDimensionValid ? ' canvas-designer__dim-input--invalid' : ''}`}
            value={widthInput}
            min={1}
            max={1920}
            onChange={(e) => setWidthInput(e.target.value)}
            onBlur={commitDimension}
            aria-label="Canvas width"
            aria-invalid={isDimensionValid ? undefined : true}
          />
          <span className="canvas-designer__dim-separator" aria-hidden="true">×</span>
          <label className="canvas-designer__dim-label" htmlFor="canvas-height">H</label>
          <input
            id="canvas-height"
            type="number"
            className={`canvas-designer__dim-input${!isDimensionValid ? ' canvas-designer__dim-input--invalid' : ''}`}
            value={heightInput}
            min={1}
            max={1920}
            onChange={(e) => setHeightInput(e.target.value)}
            onBlur={commitDimension}
            aria-label="Canvas height"
            aria-invalid={isDimensionValid ? undefined : true}
          />
          <span className="canvas-designer__dim-unit" aria-hidden="true">px</span>
        </div>

        {!isLocked && (
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--primary canvas-designer__btn--with-icon"
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
                  width={canvasConfig.width + 2000}
                  height={canvasConfig.height + 2000}
                  style={{
                    position: 'absolute',
                    top: `${-1000 * zoomScale}px`,
                    left: `${-1000 * zoomScale}px`,
                    width: `${(canvasConfig.width + 2000) * zoomScale}px`,
                    height: `${(canvasConfig.height + 2000) * zoomScale}px`,
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

          <div className="canvas-designer__bottom-panel">
            <div className="canvas-designer__bottom-panel-left">
              <label className="canvas-designer__prop-label">
                <input
                  type="checkbox"
                  className="canvas-designer__prop-checkbox"
                  checked={isClipToCanvas}
                  onChange={(e) => setIsClipToCanvas(e.target.checked)}
                />
                <span style={{ paddingLeft: '4px' }}>Clip to canvas</span>
              </label>
            </div>
            <div className="canvas-designer__bottom-panel-right">
              <button
                type="button"
                className="canvas-designer__btn"
                onClick={zoomToFit}
              >
                Zoom to fit
              </button>
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
              <>
                {selectedId ? (
                  <p className="inspector-panel__hint">Properties coming in Phase 3</p>
                ) : (
                  <p className="inspector-panel__empty">
                    Select an element to edit its properties
                  </p>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
