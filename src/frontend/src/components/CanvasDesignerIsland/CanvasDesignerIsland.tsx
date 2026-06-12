import { useReducer, useEffect, useRef, useState } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { uploadFile } from '../../upload/s3UploadService';
import type { UploadState } from '../../upload/uploadTypes';
import { canvasReducer } from './canvasReducer';
import type { TextElement } from './canvasReducer';
import './CanvasDesignerIsland.css';

interface CanvasDesignerIslandProps {
  overlayPresignedUpload: PresignedUpload | null;
  onOverlayUploaded: () => void;
}

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

function drawElements(ctx: CanvasRenderingContext2D, elements: TextElement[]) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  for (const el of elements) {
    ctx.font = `${el.fontSize}px Inter, sans-serif`;
    ctx.fillStyle = el.color;
    ctx.fillText(el.text, el.x, el.y);
  }
}

export default function CanvasDesignerIsland({
  overlayPresignedUpload,
  onOverlayUploaded,
}: CanvasDesignerIslandProps) {
  const [elements, dispatch] = useReducer(canvasReducer, []);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isLocked = overlayPresignedUpload === null;

  useEffect(() => {
    if (isLocked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawElements(ctx, elements);
  }, [elements, isLocked]);

  async function handleUpload() {
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
        <button
          type="button"
          className="canvas-designer__btn"
          onClick={() => dispatch({ type: 'ADD_ELEMENT' })}
          disabled={isLocked || uploadState === 'uploading'}
        >
          Add Text
        </button>

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
              <span className="canvas-designer__element-label">{el.text}</span>
              <button
                type="button"
                className="canvas-designer__btn canvas-designer__btn--danger"
                onClick={() => dispatch({ type: 'DELETE_ELEMENT', id: el.id })}
                aria-label={`Delete ${el.text}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="canvas-designer__canvas-wrapper">
        {isLocked && (
          <div className="canvas-designer__lock-overlay" aria-hidden="true">
            <span className="canvas-designer__lock-icon">🔒</span>
            <p>Upload a video first to enable the canvas designer</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="canvas-designer__canvas"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-label="Overlay canvas"
        />
      </div>
    </section>
  );
}
