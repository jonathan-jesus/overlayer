import { useReducer, useRef, useState, useMemo } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { canvasReducer } from './canvasReducer';
import LayerPanel from './LayerPanel';
import CanvasAdorner from './CanvasAdorner';
import PropertiesPanel from './PropertiesPanel';
import CanvasSettingsPanel from './CanvasSettingsPanel';
import { TypeIcon, SquareIcon, ImageIcon, UploadIcon, SpinnerIcon, PropertiesIcon, ChevronRightIcon, ZoomOutIcon, ZoomInIcon, ZoomToFitIcon } from './icons';
import { useShiftKey } from './useShiftKey';
import { useCanvasConfig } from './useCanvasConfig';
import { useZoom } from './useZoom';
import { usePan } from './usePan';
import { useUpload } from './useUpload';
import { useCanvasRenderer, CANVAS_PADDING } from './useCanvasRenderer';
import './EditorLayout.css';
import './CanvasDesignerIsland.css';

interface CanvasDesignerIslandProps {
  overlayPresignedUpload: PresignedUpload | null;
  onOverlayUploaded: () => void;
}

export default function CanvasDesignerIsland({
  overlayPresignedUpload,
  onOverlayUploaded,
}: CanvasDesignerIslandProps) {
  const [elements, dispatch] = useReducer(canvasReducer, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keepProportions, setKeepProportions] = useState(true);
  const [isLayersOpen, setIsLayersOpen] = useState(true);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [isClipToCanvas, setIsClipToCanvas] = useState(true);
  const [showTransparencyGrid, setShowTransparencyGrid] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const isLocked = overlayPresignedUpload === null;
  const isShiftPressed = useShiftKey();
  const canvasConfigState = useCanvasConfig();
  const { canvasConfig } = canvasConfigState;

  const {
    zoomScale,
    zoomInput,
    zoomToFit,
    handleZoomOut,
    handleZoomIn,
    handleZoomInputChange,
    handleZoomKeyDown,
    onZoomInputFocus,
    onZoomInputBlur,
  } = useZoom(viewportRef, canvasConfig, setPan);

  const { isPanning, startPanning, viewportPointerHandlers } = usePan(
    viewportRef,
    setPan,
    zoomToFit,
  );

  const { uploadState, errorMessage, handleUpload } = useUpload(
    overlayPresignedUpload,
    canvasConfig,
    elements,
    imageCache,
    onOverlayUploaded,
  );

  useCanvasRenderer(canvasRef, elements, isLocked, canvasConfig, editingId, imageCache);

  function handleSelect(id: string | null) {
    setSelectedId(id);
    setEditingId(null);
  }

  const effectiveKeepProportions = isShiftPressed ? !keepProportions : keepProportions;

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  );

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
          y: canvasConfig.height / 2 - img.naturalHeight / 2,
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
            onFocus={onZoomInputFocus}
            onBlur={onZoomInputBlur}
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
            onSelect={handleSelect}
            dispatch={dispatch}
            isOpen={isLayersOpen}
            onToggle={() => setIsLayersOpen(!isLayersOpen)}
          />
        </div>

        <div className="editor-layout__canvas-area">
          <div
            ref={viewportRef}
            className={`canvas-designer__viewport${isPanning ? ' canvas-designer__viewport--panning' : ''}`}
            {...viewportPointerHandlers}
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
                className={`canvas-designer__canvas-wrapper${isClipToCanvas ? ' canvas-designer__canvas-wrapper--clipped' : ''}${showTransparencyGrid ? ' canvas-designer__canvas-wrapper--transparent-grid' : ''}`}
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
                    onSelect={handleSelect}
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
              selectedElement ? (
                <PropertiesPanel
                  selectedElement={selectedElement}
                  dispatch={dispatch}
                  keepProportions={keepProportions}
                  effectiveKeepProportions={effectiveKeepProportions}
                  onKeepProportionsChange={setKeepProportions}
                />
              ) : (
                <CanvasSettingsPanel
                  widthInput={canvasConfigState.widthInput}
                  heightInput={canvasConfigState.heightInput}
                  setWidthInput={canvasConfigState.handleWidthInputChange}
                  setHeightInput={canvasConfigState.handleHeightInputChange}
                  commitDimension={canvasConfigState.commitDimension}
                  isDimensionValid={canvasConfigState.isDimensionValid}
                  isClipToCanvas={isClipToCanvas}
                  setIsClipToCanvas={setIsClipToCanvas}
                  keepCanvasProportions={canvasConfigState.keepCanvasProportions}
                  setKeepCanvasProportions={canvasConfigState.setKeepCanvasProportions}
                  showTransparencyGrid={showTransparencyGrid}
                  setShowTransparencyGrid={setShowTransparencyGrid}
                />
              )
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
