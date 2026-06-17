import { useReducer, useEffect, useRef, useState } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { uploadFile } from '../../upload/s3UploadService';
import type { UploadState } from '../../upload/uploadTypes';
import { canvasReducer } from './canvasReducer';
import type { CanvasElement, Shadow } from './canvasReducer';
import LayerPanel from './LayerPanel';
import CanvasAdorner from './CanvasAdorner';
import './EditorLayout.css';
import './CanvasDesignerIsland.css';

function TypeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function SquareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="canvas-designer__spinner"
      aria-hidden="true"
    >
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function PropertiesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inspector-panel__header-icon">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="2" y1="14" x2="6" y2="14" />
      <line x1="10" y1="8" x2="14" y2="8" />
      <line x1="18" y1="16" x2="22" y2="16" />
    </svg>
  );
}

interface CanvasDesignerIslandProps {
  overlayPresignedUpload: PresignedUpload | null;
  onOverlayUploaded: () => void;
}

interface CanvasConfig {
  width: number;
  height: number;
}

const DEFAULT_CANVAS: CanvasConfig = { width: 1920, height: 1080 };

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

  // Reset editing mode if selection changes
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setEditingId(null);
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const scaleFactorRef = useRef(1);
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
      ctx!.clearRect(0, 0, canvasConfig.width, canvasConfig.height);
      for (const el of elements) {
        if (el.id === editingId) continue;
        drawElement(ctx!, el, imageCache.current, () => latestDrawRef.current());
      }
    }

    latestDrawRef.current = draw;
    draw();
  }, [elements, isLocked, canvasConfig, editingId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      if (canvas.width > 0) {
        scaleFactorRef.current = canvas.offsetWidth / canvas.width;
      }
    });
    observer.observe(canvas);
    if (canvas.width > 0) {
      scaleFactorRef.current = canvas.offsetWidth / canvas.width;
    }
    return () => observer.disconnect();
  }, []);

  const pendingW = parseInt(widthInput, 10);
  const pendingH = parseInt(heightInput, 10);
  const isDimensionValid = isValidDimension(pendingW, pendingH);

  function commitDimension(): void {
    if (isValidDimension(pendingW, pendingH)) {
      setCanvasConfig({ width: pendingW, height: pendingH });
    }
  }

  function handleDelete(): void {
    if (!selectedId) return;
    dispatch({ type: 'DELETE_ELEMENT', id: selectedId });
    setSelectedId(null);
  }

  function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        dispatch({ type: 'ADD_IMAGE', src, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleUpload(): Promise<void> {
    if (!overlayPresignedUpload || !canvasRef.current) return;
    setUploadState('uploading');
    setErrorMessage(null);

    canvasRef.current.toBlob(async (blob) => {
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
            onClick={() => dispatch({ type: 'ADD_TEXT' })}
            disabled={isLocked || uploadState === 'uploading'}
            aria-label="Text"
          >
            <TypeIcon />
          </button>
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--icon"
            onClick={() => dispatch({ type: 'ADD_RECT' })}
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
          <button
            type="button"
            className="canvas-designer__btn canvas-designer__btn--icon canvas-designer__btn--danger"
            onClick={handleDelete}
            disabled={!selectedId || uploadState === 'uploading'}
            aria-label="Delete selected element"
          >
            <TrashIcon />
          </button>
        </div>

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
            className="canvas-designer__canvas-wrapper"
            style={{ aspectRatio: `${canvasConfig.width} / ${canvasConfig.height}` }}
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
              width={canvasConfig.width}
              height={canvasConfig.height}
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
              />
            )}
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
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
