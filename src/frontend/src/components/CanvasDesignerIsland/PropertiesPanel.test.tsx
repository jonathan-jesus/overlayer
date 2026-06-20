import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropertiesPanel from './PropertiesPanel';
import type { TextElement, RectElement, ImageElement } from './canvasReducer';

const BASE = {
  x: 100,
  y: 200,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 100,
  shadow: { color: '#000000', opacity: 100, distance: 0, angle: 135, blur: 0 },
  visible: true,
};

function makeText(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'text-1',
    kind: 'text',
    text: 'Hello',
    fontSize: 32,
    font: 'Inter',
    fill: '#ffffff',
    ...BASE,
    ...overrides,
  };
}

function makeRect(overrides: Partial<RectElement> = {}): RectElement {
  return {
    id: 'rect-1',
    kind: 'rect',
    fill: '#6366f1',
    stroke: '#ffffff',
    strokeWidth: 0,
    strokeAlign: 'center',
    width: 200,
    height: 100,
    ...BASE,
    ...overrides,
  };
}

function makeImage(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: 'image-1',
    kind: 'image',
    src: 'data:image/png;base64,abc',
    width: 400,
    height: 300,
    ...BASE,
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  keepProportions: false,
  effectiveKeepProportions: false,
  onKeepProportionsChange: vi.fn(),
};

describe('PropertiesPanel', () => {

  describe('Element-kind sections', () => {
    it('shows font selector and fill color for a text element', () => {
      render(
        <PropertiesPanel
          selectedElement={makeText()}
          dispatch={vi.fn()}
          {...DEFAULT_PROPS}
        />
      );

      expect(screen.getByRole('combobox', { name: /font family/i })).toBeInTheDocument();
      expect(screen.getByLabelText('prop-text-fill')).toBeInTheDocument();
      expect(screen.queryByLabelText('prop-rect-fill')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/stroke width/i)).not.toBeInTheDocument();
    });

    it('shows fill, stroke, and stroke-width inputs for a rect element; no font selector', () => {
      render(
        <PropertiesPanel
          selectedElement={makeRect()}
          dispatch={vi.fn()}
          {...DEFAULT_PROPS}
        />
      );

      expect(screen.getByLabelText('prop-rect-fill')).toBeInTheDocument();
      expect(screen.getByLabelText('prop-rect-stroke')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: /stroke width/i })).toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /font family/i })).not.toBeInTheDocument();
    });

    it('shows "Replace image" button for an image element', () => {
      render(
        <PropertiesPanel
          selectedElement={makeImage()}
          dispatch={vi.fn()}
          {...DEFAULT_PROPS}
        />
      );

      expect(screen.getByRole('button', { name: /replace image/i })).toBeInTheDocument();
    });
  });

  describe('Dispatch calls', () => {
    it('dispatches UPDATE_ELEMENT with correct opacity when the opacity slider changes', () => {
      const dispatch = vi.fn();

      render(
        <PropertiesPanel
          selectedElement={makeText({ id: 'text-1', opacity: 100 })}
          dispatch={dispatch}
          {...DEFAULT_PROPS}
        />
      );

      const transformSection = screen.getByText('Transform').closest('section')!;
      const opacityInput = within(transformSection).getByRole('spinbutton', { name: /^opacity$/i });
      fireEvent.change(opacityInput, { target: { value: '50' } });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'UPDATE_ELEMENT',
        id: 'text-1',
        patch: { opacity: 50 },
      });
    });

    it('dispatches UPDATE_ELEMENT for shadow.blur when the blur input changes', async () => {
      const user = userEvent.setup();
      const dispatch = vi.fn();

      render(
        <PropertiesPanel
          selectedElement={makeRect({ id: 'rect-1' })}
          dispatch={dispatch}
          {...DEFAULT_PROPS}
        />
      );

      const blurInput = screen.getByRole('spinbutton', { name: /^blur$/i });
      await user.clear(blurInput);
      await user.type(blurInput, '8');

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE_ELEMENT',
          id: 'rect-1',
          patch: expect.objectContaining({
            shadow: expect.objectContaining({ blur: 8 }),
          }),
        })
      );
    });

    it('dispatches UPDATE_ELEMENT with visible: false when the visible checkbox is unchecked', async () => {
      const user = userEvent.setup();
      const dispatch = vi.fn();

      render(
        <PropertiesPanel
          selectedElement={makeText({ id: 'text-1', visible: true })}
          dispatch={dispatch}
          {...DEFAULT_PROPS}
        />
      );

      await user.click(screen.getByRole('checkbox', { name: /visible/i }));

      expect(dispatch).toHaveBeenCalledWith({
        type: 'UPDATE_ELEMENT',
        id: 'text-1',
        patch: { visible: false },
      });
    });
  });

  describe('Lock proportions', () => {
    it('updates Scale Y proportionally when Scale X changes and lock is active', () => {
      const dispatch = vi.fn();

      render(
        <PropertiesPanel
          selectedElement={makeText({ id: 'text-1', scaleX: 1, scaleY: 1 })}
          dispatch={dispatch}
          {...DEFAULT_PROPS}
          keepProportions={true}
          effectiveKeepProportions={true}
          onKeepProportionsChange={vi.fn()}
        />
      );

      const scaleXInput = screen.getByRole('spinbutton', { name: /scale x/i });
      fireEvent.change(scaleXInput, { target: { value: '2' } });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'UPDATE_ELEMENT',
        id: 'text-1',
        patch: { scaleX: 2, scaleY: 2 },
      });
    });

    it('calls onKeepProportionsChange when the lock button is clicked', async () => {
      const user = userEvent.setup();
      const onKeepProportionsChange = vi.fn();

      render(
        <PropertiesPanel
          selectedElement={makeText()}
          dispatch={vi.fn()}
          {...DEFAULT_PROPS}
          keepProportions={false}
          effectiveKeepProportions={false}
          onKeepProportionsChange={onKeepProportionsChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /lock proportions/i }));

      expect(onKeepProportionsChange).toHaveBeenCalledWith(true);
    });
  });
});
