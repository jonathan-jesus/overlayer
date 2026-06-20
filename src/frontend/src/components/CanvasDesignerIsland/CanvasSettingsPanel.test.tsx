import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CanvasSettingsPanel from './CanvasSettingsPanel';

const DEFAULT_PROPS = {
  widthInput: '1920',
  heightInput: '1080',
  setWidthInput: vi.fn(),
  setHeightInput: vi.fn(),
  commitDimension: vi.fn(),
  isDimensionValid: true,
  isClipToCanvas: true,
  setIsClipToCanvas: vi.fn(),
  keepCanvasProportions: false,
  setKeepCanvasProportions: vi.fn(),
  showTransparencyGrid: true,
  setShowTransparencyGrid: vi.fn(),
};

describe('CanvasSettingsPanel', () => {
  it('shows canvas properties', () => {
    render(<CanvasSettingsPanel {...DEFAULT_PROPS} />);

    expect(screen.getByText('Canvas')).toBeInTheDocument();
    expect(screen.getByLabelText(/canvas width/i)).toHaveValue(1920);
    expect(screen.getByLabelText(/canvas height/i)).toHaveValue(1080);
    expect(screen.getByLabelText(/clip to canvas/i)).toBeChecked();
    expect(screen.getByLabelText(/show transparency grid/i)).toBeChecked();
  });

  it('calls setKeepCanvasProportions when the canvas lock button is clicked', async () => {
    const user = userEvent.setup();
    const setKeepCanvasProportions = vi.fn();

    render(
      <CanvasSettingsPanel
        {...DEFAULT_PROPS}
        keepCanvasProportions={false}
        setKeepCanvasProportions={setKeepCanvasProportions}
      />
    );

    await user.click(screen.getByRole('button', { name: /lock aspect ratio/i }));

    expect(setKeepCanvasProportions).toHaveBeenCalledWith(true);
  });
});
