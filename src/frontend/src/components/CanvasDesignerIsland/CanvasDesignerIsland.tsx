import { useReducer, useEffect, useRef, useState } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { uploadFile } from '../../upload/s3UploadService';
import type { UploadState } from '../../upload/uploadTypes';
import { canvasReducer } from './canvasReducer';
import type { CanvasElement, Shadow } from './canvasReducer';
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

export function isValidDimension(w: number, h: number): boolean {
  if (!Number.isInteger(w) || !Number.isInteger(h)) return false;
  if (w < 1 || h < 1 || w > 1920 || h > 1920) return false;
  if (w >= h) return h <= 1080;  // landscape or square: height must fit landscape limit
  return w <= 1080;              // portrait: width must fit portrait limit
}

function getElementLabel(el: CanvasElement): string {
  switch (el.kind) {
    case 'text': return el.text;
    case 'rect': return 'Rectangle';
    case 'image': return 'Image';
  }
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
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>(DEFAULT_CANVAS);
  const [widthInput, setWidthInput] = useState(String(DEFAULT_CANVAS.width));
  const [heightInput, setHeightInput] = useState(String(DEFAULT_CANVAS.height));

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
        drawElement(ctx!, el, imageCache.current, () => latestDrawRef.current());
      }
    }

    latestDrawRef.current = draw;
    draw();
  }, [elements, isLocked, canvasConfig]);

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
            className="canvas-designer__btn"
            onClick={() => dispatch({ type: 'ADD_TEXT' })}
            disabled={isLocked || uploadState === 'uploading'}
          >
            Text
          </button>
          <button
            type="button"
            className="canvas-designer__btn"
            onClick={() => dispatch({ type: 'ADD_RECT' })}
            disabled={isLocked || uploadState === 'uploading'}
          >
            Rectangle
          </button>
          <button
            type="button"
            className="canvas-designer__btn"
            onClick={() => imageInputRef.current?.click()}
            disabled={isLocked || uploadState === 'uploading'}
          >
            Image
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
            className="canvas-designer__btn canvas-designer__btn--primary"
            onClick={handleUpload}
            disabled={uploadState === 'uploading' || uploadState === 'done'}
          >
            {uploadState === 'uploading' ? 'Uploading…' : 'Upload Overlay'}
          </button>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="canvas-designer__error">
          {errorMessage}
        </p>
      )}

      {elements.length > 0 && (
        <ul className="canvas-designer__element-list">
          {elements.map((el) => (
            <li key={el.id} className="canvas-designer__element-item">
              <span className="canvas-designer__element-label">{getElementLabel(el)}</span>
              <button
                type="button"
                className="canvas-designer__btn canvas-designer__btn--danger"
                onClick={() => dispatch({ type: 'DELETE_ELEMENT', id: el.id })}
                aria-label={`Delete ${getElementLabel(el)}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

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
      </div>
    </section>
  );
}
