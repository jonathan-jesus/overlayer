import { useRef, useCallback } from 'react';
import type { CanvasElement, CanvasAction, CanvasElementPatch } from './canvasReducer';
import './PropertiesPanel.css';
import { LockIcon, UnlockIcon } from './icons';

const GOOGLE_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Poppins',
  'Lato',
  'Raleway',
  'Oswald',
  'Playfair Display',
  'Nunito',
];

interface ColorFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorField({ id, value, onChange }: ColorFieldProps) {
  return (
    <div className="props-panel__color-row">
      <div className="props-panel__color-swatch">
        <div
          className="props-panel__color-preview"
          style={{ background: value }}
        />
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={id}
        />
      </div>
      <span className="props-panel__color-value">{value}</span>
    </div>
  );
}

interface SliderRowProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function SliderRow({ id, label, value, min, max, onChange }: SliderRowProps) {
  const handleInput = useCallback(
    (raw: string) => {
      const n = parseFloat(raw);
      if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
    },
    [onChange, min, max],
  );

  return (
    <div className="props-panel__row props-panel__row--slider">
      <label className="props-panel__label" htmlFor={`${id}-input`}>
        {label}
      </label>
      <input
        id={`${id}-input`}
        type="number"
        className="props-panel__input"
        value={value}
        min={min}
        max={max}
        onChange={(e) => handleInput(e.target.value)}
        aria-label={label}
      />
      <input
        id={`${id}-slider`}
        type="range"
        className="props-panel__slider"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} slider`}
      />
    </div>
  );
}

interface NumberRowProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function NumberRow({ id, label, value, onChange }: NumberRowProps) {
  return (
    <div className="props-panel__row">
      <label className="props-panel__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="props-panel__input"
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        aria-label={label}
      />
    </div>
  );
}

interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  dispatch: React.Dispatch<CanvasAction>;
  keepProportions: boolean;
  effectiveKeepProportions: boolean;
  onKeepProportionsChange: (locked: boolean) => void;
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

export default function PropertiesPanel({
  selectedElement,
  dispatch,
  keepProportions,
  effectiveKeepProportions,
  onKeepProportionsChange,
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
}: PropertiesPanelProps) {
  const replaceImageInputRef = useRef<HTMLInputElement>(null);

  function patch(fields: CanvasElementPatch) {
    if (!selectedElement) return;
    dispatch({ type: 'UPDATE_ELEMENT', id: selectedElement.id, patch: fields });
  }

  function handleScaleXChange(newX: number) {
    if (!selectedElement) return;
    if (effectiveKeepProportions && selectedElement.scaleX !== 0) {
      const ratio = newX / selectedElement.scaleX;
      patch({ scaleX: newX, scaleY: selectedElement.scaleY * ratio });
    } else {
      patch({ scaleX: newX });
    }
  }

  function handleScaleYChange(newY: number) {
    if (!selectedElement) return;
    if (effectiveKeepProportions && selectedElement.scaleY !== 0) {
      const ratio = newY / selectedElement.scaleY;
      patch({ scaleY: newY, scaleX: selectedElement.scaleX * ratio });
    } else {
      patch({ scaleY: newY });
    }
  }

  function handleReplaceImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedElement || selectedElement.kind !== 'image') return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        patch({ src, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  if (!selectedElement) {
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

  const el = selectedElement;

  return (
    <div className="props-panel">
      {/* Transform */}
      <section className="props-panel__section">
        <h4 className="props-panel__section-title">Transform</h4>

        <NumberRow
          id="prop-x"
          label="X"
          value={Math.round(el.x)}
          onChange={(v) => patch({ x: v })}
        />
        <NumberRow
          id="prop-y"
          label="Y"
          value={Math.round(el.y)}
          onChange={(v) => patch({ y: v })}
        />

        {/* Scale with lock-proportions */}
        <div className="props-panel__row">
          <span className="props-panel__label">Scale</span>
          <div className="props-panel__scale-controls">
            <input
              id="prop-scale-x"
              type="number"
              className="props-panel__input"
              value={parseFloat(el.scaleX.toFixed(3))}
              step={0.01}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (!Number.isNaN(n)) handleScaleXChange(n);
              }}
              aria-label="Scale X"
            />
            <button
              type="button"
              className={`props-panel__lock-btn${effectiveKeepProportions ? ' props-panel__lock-btn--active' : ''}`}
              onClick={() => onKeepProportionsChange(!keepProportions)}
              aria-label={effectiveKeepProportions ? 'Unlock proportions' : 'Lock proportions'}
              aria-pressed={effectiveKeepProportions}
            >
              {effectiveKeepProportions ? <LockIcon width="12" height="12" className="" /> : <UnlockIcon width="12" height="12" className="" />}
            </button>
            <input
              id="prop-scale-y"
              type="number"
              className="props-panel__input"
              value={parseFloat(el.scaleY.toFixed(3))}
              step={0.01}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (!Number.isNaN(n)) handleScaleYChange(n);
              }}
              aria-label="Scale Y"
            />
          </div>
        </div>

        <SliderRow
          id="prop-rotation"
          label="Rotation"
          value={Math.round(el.rotation)}
          min={0}
          max={360}
          onChange={(v) => patch({ rotation: v })}
        />
        <SliderRow
          id="prop-opacity"
          label="Opacity"
          value={Math.round(el.opacity)}
          min={0}
          max={100}
          onChange={(v) => patch({ opacity: v })}
        />

        <div className="props-panel__check-row">
          <label className="props-panel__check-label" htmlFor="prop-visible">
            <input
              id="prop-visible"
              type="checkbox"
              className="props-panel__checkbox"
              checked={el.visible}
              onChange={(e) => patch({ visible: e.target.checked })}
            />
            Visible
          </label>
        </div>
      </section>

      {/* Shadow */}
      <section className="props-panel__section">
        <h4 className="props-panel__section-title">Shadow</h4>

        <div className="props-panel__row">
          <label className="props-panel__label" htmlFor="prop-shadow-color">Color</label>
          <ColorField
            id="prop-shadow-color"
            value={el.shadow.color}
            onChange={(v) => patch({ shadow: { ...el.shadow, color: v } })}
          />
        </div>
        <SliderRow
          id="prop-shadow-opacity"
          label="Opacity"
          value={el.shadow.opacity}
          min={0}
          max={100}
          onChange={(v) => patch({ shadow: { ...el.shadow, opacity: v } })}
        />
        <SliderRow
          id="prop-shadow-distance"
          label="Distance"
          value={el.shadow.distance}
          min={0}
          max={200}
          onChange={(v) => patch({ shadow: { ...el.shadow, distance: v } })}
        />
        <SliderRow
          id="prop-shadow-angle"
          label="Angle"
          value={el.shadow.angle}
          min={0}
          max={360}
          onChange={(v) => patch({ shadow: { ...el.shadow, angle: v } })}
        />
        <SliderRow
          id="prop-shadow-blur"
          label="Blur"
          value={el.shadow.blur}
          min={0}
          max={100}
          onChange={(v) => patch({ shadow: { ...el.shadow, blur: v } })}
        />
      </section>

      {/* Text-only */}
      {el.kind === 'text' && (
        <section className="props-panel__section">
          <h4 className="props-panel__section-title">Text</h4>

          <div className="props-panel__row">
            <label className="props-panel__label" htmlFor="prop-font">Font</label>
            <select
              id="prop-font"
              className="props-panel__select"
              value={el.font}
              onChange={(e) => patch({ font: e.target.value })}
              aria-label="Font family"
            >
              {GOOGLE_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <NumberRow
            id="prop-font-size"
            label="Size"
            value={el.fontSize}
            onChange={(v) => patch({ fontSize: Math.max(1, Math.round(v)) })}
          />

          <div className="props-panel__row">
            <label className="props-panel__label" htmlFor="prop-text-fill">Fill</label>
            <ColorField
              id="prop-text-fill"
              value={el.fill}
              onChange={(v) => patch({ fill: v })}
            />
          </div>
        </section>
      )}

      {/* Rect-only */}
      {el.kind === 'rect' && (
        <section className="props-panel__section">
          <h4 className="props-panel__section-title">Rectangle</h4>

          <div className="props-panel__row">
            <label className="props-panel__label" htmlFor="prop-rect-fill">Fill</label>
            <ColorField
              id="prop-rect-fill"
              value={el.fill}
              onChange={(v) => patch({ fill: v })}
            />
          </div>

          <div className="props-panel__row">
            <label className="props-panel__label" htmlFor="prop-rect-stroke">Stroke</label>
            <ColorField
              id="prop-rect-stroke"
              value={el.stroke}
              onChange={(v) => patch({ stroke: v })}
            />
          </div>

          <div className="props-panel__row--stack">
            <span className="props-panel__label">Align</span>
            <div className="props-panel__segmented" role="group" aria-label="Stroke alignment">
              {(['inside', 'center', 'outside'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  className={`props-panel__seg-btn${el.strokeAlign === align ? ' props-panel__seg-btn--active' : ''}`}
                  onClick={() => patch({ strokeAlign: align })}
                  aria-pressed={el.strokeAlign === align}
                >
                  {align.charAt(0).toUpperCase() + align.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <SliderRow
            id="prop-stroke-width"
            label="Stroke width"
            value={el.strokeWidth}
            min={0}
            max={50}
            onChange={(v) => patch({ strokeWidth: Math.max(0, Math.round(v)) })}
          />
        </section>
      )}

      {/* Image-only */}
      {el.kind === 'image' && (
        <section className="props-panel__section">
          <h4 className="props-panel__section-title">Image</h4>

          <div className="props-panel__image-wrapper">
            <button
              type="button"
              className="props-panel__replace-btn"
              onClick={() => replaceImageInputRef.current?.click()}
            >
              Replace image
            </button>
            <input
              ref={replaceImageInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.svg"
              style={{ display: 'none' }}
              onChange={handleReplaceImageChange}
              aria-label="Replace image file"
            />
          </div>
        </section>
      )}
    </div>
  );
}
