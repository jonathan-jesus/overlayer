import { useRef } from 'react';
import type { CanvasElement, CanvasAction } from './canvasReducer';
import './LayerPanel.css';
import { TypeIcon, SquareIcon, ImageIcon, LayersIcon, ChevronLeftIcon, } from './icons';

interface LayerPanelProps {
  elements: CanvasElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dispatch: React.Dispatch<CanvasAction>;
  isOpen?: boolean;
  onToggle?: () => void;
}

function getKindIcon(kind: CanvasElement['kind']) {
  switch (kind) {
    case 'text': return <TypeIcon width={14} height={14} />;
    case 'rect': return <SquareIcon width={14} height={14} />;
    case 'image': return <ImageIcon width={14} height={14} />;
  }
}

function getElementLabel(el: CanvasElement): string {
  switch (el.kind) {
    case 'text': return el.text || 'Text';
    case 'rect': return 'Rectangle';
    case 'image': return 'Image';
  }
}

export default function LayerPanel({
  elements,
  selectedId,
  onSelect,
  dispatch,
  isOpen = true,
  onToggle,
}: LayerPanelProps) {
  const reversed = [...elements].reverse();

  const dragFromRef = useRef<number | null>(null);

  function handleDragStart(displayIndex: number): void {
    dragFromRef.current = displayIndex;
  }

  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(displayIndex: number): void {
    const fromDisplay = dragFromRef.current;
    dragFromRef.current = null;

    if (fromDisplay === null || fromDisplay === displayIndex) return;

    const fromIndex = elements.length - 1 - fromDisplay;
    const toIndex = elements.length - 1 - displayIndex;

    dispatch({ type: 'REORDER_ELEMENTS', fromIndex, toIndex });
  }

  return (
    <aside className={`layer-panel ${!isOpen ? 'layer-panel--collapsed' : ''}`} aria-label="Layers">
      <div className="layer-panel__header">
        {isOpen ? (
          <>
            <div className="layer-panel__header-title">
              <LayersIcon />
              <h3 className="layer-panel__title">Layers</h3>
            </div>
            {onToggle && (
              <button
                type="button"
                className="layer-panel__toggle-btn"
                onClick={onToggle}
                aria-label="Collapse Layers panel"
              >
                <ChevronLeftIcon />
              </button>
            )}
          </>
        ) : (
          onToggle && (
            <button
              type="button"
              className="layer-panel__toggle-btn layer-panel__toggle-btn--collapsed"
              onClick={onToggle}
              aria-label="Expand Layers panel"
            >
              <LayersIcon />
            </button>
          )
        )}
      </div>
      {isOpen && (
        <>
          {reversed.length === 0 ? (
            <p className="layer-panel__empty">No layers yet</p>
          ) : (
            <ul className="layer-panel__list" aria-label="Layer stack">
              {reversed.map((el, displayIndex) => (
                <li
                  key={el.id}
                  className={`layer-panel__item${el.id === selectedId ? ' layer-panel__item--selected' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(displayIndex)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(displayIndex)}
                >
                  <button
                    type="button"
                    className="layer-panel__select-btn"
                    onClick={() => onSelect(el.id)}
                    aria-pressed={el.id === selectedId}
                    aria-label={`Select ${getElementLabel(el)}`}
                  >
                    <span className="layer-panel__kind-icon" aria-hidden="true">
                      {getKindIcon(el.kind)}
                    </span>
                    <span className="layer-panel__label">{getElementLabel(el)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
