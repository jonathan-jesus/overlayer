import { useRef, useState } from 'react';
import type { CanvasElement, CanvasAction } from './canvasReducer';
import ConfirmModal from './ConfirmModal';
import './LayerPanel.css';
import { TypeIcon, SquareIcon, ImageIcon, LayersIcon, ChevronLeftIcon, EyeIcon, EyeOffIcon, TrashIcon } from './icons';

interface LayerPanelProps {
  elements: CanvasElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
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

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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

  const elementToDelete = deleteConfirmId ? elements.find((el) => el.id === deleteConfirmId) : null;

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
                  className={`layer-panel__item${el.id === selectedId ? ' layer-panel__item--selected' : ''}${!el.visible ? ' layer-panel__item--hidden' : ''}`}
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
                  <div className="layer-panel__actions">
                    <button
                      type="button"
                      className="layer-panel__action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({
                          type: 'UPDATE_ELEMENT',
                          id: el.id,
                          patch: { visible: !el.visible },
                        });
                      }}
                      aria-label={el.visible ? 'Hide layer' : 'Show layer'}
                    >
                      {el.visible ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                    <button
                      type="button"
                      className="layer-panel__action-btn layer-panel__action-btn--delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(el.id);
                      }}
                      aria-label="Delete layer"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <ConfirmModal
        isOpen={deleteConfirmId !== null}
        title="Delete Layer"
        message={`Are you sure you want to delete the layer "${elementToDelete
          ? getElementLabel(elementToDelete)
          : ''
          }"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (deleteConfirmId) {
            dispatch({ type: 'DELETE_ELEMENT', id: deleteConfirmId });
            if (selectedId === deleteConfirmId) {
              onSelect(null);
            }
            setDeleteConfirmId(null);
          }
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </aside>
  );
}
