import { LockIcon, UnlockIcon } from './icons';
import './PropertiesPanel.css';

interface CanvasSettingsPanelProps {
  widthInput: string;
  heightInput: string;
  setWidthInput: (val: string) => void;
  setHeightInput: (val: string) => void;
  commitDimension: () => void;
  isDimensionValid: boolean;
  isClipToCanvas: boolean;
  setIsClipToCanvas: (val: boolean) => void;
  keepCanvasProportions: boolean;
  setKeepCanvasProportions: (locked: boolean) => void;
  showTransparencyGrid: boolean;
  setShowTransparencyGrid: (val: boolean) => void;
}

export default function CanvasSettingsPanel({
  widthInput,
  heightInput,
  setWidthInput,
  setHeightInput,
  commitDimension,
  isDimensionValid,
  isClipToCanvas,
  setIsClipToCanvas,
  keepCanvasProportions,
  setKeepCanvasProportions,
  showTransparencyGrid,
  setShowTransparencyGrid,
}: CanvasSettingsPanelProps) {
  return (
    <div className="props-panel">
      <section className="props-panel__section">
        <h4 className="props-panel__section-title">Canvas</h4>

        <div className="props-panel__row">
          <span className="props-panel__label">Size</span>
          <div className="props-panel__scale-controls">
            <input
              id="canvas-width"
              type="number"
              className={`props-panel__input${!isDimensionValid ? ' props-panel__input--invalid' : ''}`}
              value={widthInput}
              min={1}
              max={1920}
              onChange={(e) => setWidthInput(e.target.value)}
              onBlur={commitDimension}
              aria-label="Canvas width"
              aria-invalid={isDimensionValid ? undefined : true}
            />
            <button
              type="button"
              className={`props-panel__lock-btn${keepCanvasProportions ? ' props-panel__lock-btn--active' : ''}`}
              onClick={() => setKeepCanvasProportions(!keepCanvasProportions)}
              aria-label={keepCanvasProportions ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              aria-pressed={keepCanvasProportions}
            >
              {keepCanvasProportions ? <LockIcon width="12" height="12" className="" /> : <UnlockIcon width="12" height="12" className="" />}
            </button>
            <input
              id="canvas-height"
              type="number"
              className={`props-panel__input${!isDimensionValid ? ' props-panel__input--invalid' : ''}`}
              value={heightInput}
              min={1}
              max={1920}
              onChange={(e) => setHeightInput(e.target.value)}
              onBlur={commitDimension}
              aria-label="Canvas height"
              aria-invalid={isDimensionValid ? undefined : true}
            />
          </div>
        </div>

        <div className="props-panel__check-row">
          <label className="props-panel__check-label" htmlFor="prop-clip-canvas">
            <input
              id="prop-clip-canvas"
              type="checkbox"
              className="props-panel__checkbox"
              checked={isClipToCanvas}
              onChange={(e) => setIsClipToCanvas(e.target.checked)}
            />
            Clip to canvas
          </label>
        </div>

        <div className="props-panel__check-row">
          <label className="props-panel__check-label" htmlFor="prop-show-transparency-grid">
            <input
              id="prop-show-transparency-grid"
              type="checkbox"
              className="props-panel__checkbox"
              checked={showTransparencyGrid}
              onChange={(e) => setShowTransparencyGrid(e.target.checked)}
            />
            Show transparency grid
          </label>
        </div>
      </section>
    </div>
  );
}
