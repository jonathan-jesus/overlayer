import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LayerPanel from './LayerPanel';
import type { TextElement, RectElement } from './canvasReducer';

function makeText(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'el-1',
    kind: 'text',
    text: 'Hello',
    fontSize: 24,
    font: 'Inter',
    fill: '#ff0000',
    x: 10,
    y: 20,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 100,
    shadow: { color: '#000000', opacity: 100, distance: 0, angle: 135, blur: 0 },
    visible: true,
    ...overrides,
  };
}

function makeRect(overrides: Partial<RectElement> = {}): RectElement {
  return {
    id: 'el-2',
    kind: 'rect',
    fill: '#6366f1',
    stroke: '#ffffff',
    strokeWidth: 0,
    strokeAlign: 'center',
    width: 200,
    height: 100,
    x: 10,
    y: 20,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 100,
    shadow: { color: '#000000', opacity: 100, distance: 0, angle: 135, blur: 0 },
    visible: true,
    ...overrides,
  };
}

describe('LayerPanel', () => {
  it('renders an empty state when there are no elements', () => {
    render(
      <LayerPanel elements={[]} selectedId={null} onSelect={vi.fn()} dispatch={vi.fn()} />
    );

    expect(screen.getByText(/no layers yet/i)).toBeInTheDocument();
  });

  it('renders all elements in reverse paint order (topmost element first)', () => {
    const el1 = makeText({ id: 'a', text: 'Bottom' });
    const el2 = makeRect({ id: 'b' });

    render(
      <LayerPanel
        elements={[el1, el2]}
        selectedId={null}
        onSelect={vi.fn()}
        dispatch={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button', { name: /^select/i });
    expect(buttons).toHaveLength(2);
    // el2 (rect) was added last → painted on top → shown first in the panel
    expect(buttons[0]).toHaveAccessibleName(/select rectangle/i);
    expect(buttons[1]).toHaveAccessibleName(/select bottom/i);
  });

  it('calls onSelect with the element id when a layer row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const el = makeText({ id: 'text-1', text: 'Hello' });

    render(
      <LayerPanel elements={[el]} selectedId={null} onSelect={onSelect} dispatch={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /select hello/i }));

    expect(onSelect).toHaveBeenCalledWith('text-1');
  });

  it('marks the selected element row as aria-pressed', () => {
    const el = makeText({ id: 'text-1', text: 'Hello' });

    render(
      <LayerPanel elements={[el]} selectedId="text-1" onSelect={vi.fn()} dispatch={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: /select hello/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('dispatches REORDER_ELEMENTS with correct state indices on drag-and-drop', () => {
    const dispatch = vi.fn();
    // State order: a(0), b(1), c(2)  →  Display order: c(0), b(1), a(2)
    const a = makeText({ id: 'a', text: 'A' });
    const b = makeRect({ id: 'b' });
    const c = makeText({ id: 'c', text: 'C' });

    render(
      <LayerPanel
        elements={[a, b, c]}
        selectedId={null}
        onSelect={vi.fn()}
        dispatch={dispatch}
      />
    );

    const items = screen.getAllByRole('listitem');
    // Drag display[0] (c, stateIndex=2) onto display[2] (a, stateIndex=0)
    fireEvent.dragStart(items[0]);
    fireEvent.dragOver(items[2]);
    fireEvent.drop(items[2]);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'REORDER_ELEMENTS',
      fromIndex: 2,
      toIndex: 0,
    });
  });

  it('renders a collapse button when onToggle is provided', () => {
    const onToggle = vi.fn();
    render(
      <LayerPanel
        elements={[]}
        selectedId={null}
        onSelect={vi.fn()}
        dispatch={vi.fn()}
        isOpen={true}
        onToggle={onToggle}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /collapse layers panel/i });
    expect(toggleBtn).toBeInTheDocument();
  });

  it('triggers onToggle callback when the toggle button is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <LayerPanel
        elements={[]}
        selectedId={null}
        onSelect={vi.fn()}
        dispatch={vi.fn()}
        isOpen={true}
        onToggle={onToggle}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /collapse layers panel/i });
    await user.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('hides contents and changes accessibility labels when isOpen is false', () => {
    const onToggle = vi.fn();
    render(
      <LayerPanel
        elements={[makeText({ id: 'a', text: 'A' })]}
        selectedId={null}
        onSelect={vi.fn()}
        dispatch={vi.fn()}
        isOpen={false}
        onToggle={onToggle}
      />
    );

    expect(screen.queryByText('Layers')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand layers panel/i })).toBeInTheDocument();
  });
});
