import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CanvasDesignerIsland from './CanvasDesignerIsland';
import { isValidDimension } from './canvasRenderer';
import type { PresignedUpload } from '../../api/apiClient';
import { mockPresignedUpload } from '../../test/fixtures/uploadFixtures';

const mockOverlayUpload: PresignedUpload = {
  ...mockPresignedUpload,
  fields: {
    ...mockPresignedUpload.fields,
    key: 'jobs/session-id/job-id/overlay.png',
    contentType: 'image/png',
  },
};

vi.mock('../../upload/s3UploadService', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  FileSizeExceededError: class FileSizeExceededError extends Error { },
  S3UploadError: class S3UploadError extends Error { },
}));

import * as s3Service from '../../upload/s3UploadService';

describe('CanvasDesignerIsland', () => {
  beforeEach(() => {
    // jsdom does not implement canvas.toBlob — stub it so upload tests work
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob(['png'], { type: 'image/png' }))
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      return {
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        fillText: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        drawImage: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 100 }),
      } as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1920,
      height: 1080,
      top: 0,
      left: 0,
      bottom: 1080,
      right: 1920,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(s3Service.uploadFile).mockReset();
    vi.mocked(s3Service.uploadFile).mockResolvedValue(undefined);
  });

  describe('Lock state', () => {
    it('renders in locked state when overlayPresignedUpload is null', () => {
      render(
        <CanvasDesignerIsland overlayPresignedUpload={null} onOverlayUploaded={vi.fn()} />
      );

      expect(screen.getByRole('region', { name: /canvas designer/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      expect(screen.queryByRole('button', { name: /save and submit/i })).not.toBeInTheDocument();
    });

    it('renders the canvas when unlocked', () => {
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      expect(document.querySelector('canvas')).toBeInTheDocument();
    });
  });

  describe('Creation tools', () => {
    let user: ReturnType<typeof userEvent.setup>;

    beforeEach(() => {
      user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );
    });

    it('adds a text element to the list when "Text" is clicked', async () => {
      await user.click(screen.getByRole('button', { name: /^text$/i }));
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });

    it('adds a rect element to the list when "Rectangle" is clicked', async () => {
      await user.click(screen.getByRole('button', { name: /^rectangle$/i }));
      const [item] = screen.getAllByRole('listitem');
      expect(item).toHaveTextContent('Rectangle');
    });

    it('opens the image file picker when "Image" is clicked', async () => {
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      await user.click(screen.getByRole('button', { name: /^image$/i }));
      expect(clickSpy).toHaveBeenCalled();
    });

    it('removes the selected element when the layer Delete button is clicked and confirmed in custom modal', async () => {
      await user.click(screen.getByRole('button', { name: /^text$/i }));

      await user.click(screen.getByRole('button', { name: /delete layer/i }));

      expect(screen.getByRole('dialog', { name: /delete layer/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^delete$/i }));

      expect(screen.queryByRole('button', { name: /select text/i })).not.toBeInTheDocument();
    });
  })

  describe('Keep proportions', () => {
    it('shows the lock-proportions button only when an element is selected', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      expect(screen.queryByRole('button', { name: /lock proportions/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^text$/i }));
      await user.click(screen.getByRole('button', { name: /select text/i }));

      const lockBtn = screen.getByRole('button', { name: /unlock proportions/i });
      expect(lockBtn).toBeInTheDocument();
      expect(lockBtn).toHaveAttribute('aria-pressed', 'true');

      await user.click(lockBtn);
      expect(screen.getByRole('button', { name: /lock proportions/i })).toBeInTheDocument();
    });
  });

  describe('Zoom controls', () => {
    it('renders zoom controls and handles zoom-in, zoom-out, and zoom-to-fit clicks', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      const zoomInBtn = screen.getByRole('button', { name: /zoom in/i });
      const zoomOutBtn = screen.getByRole('button', { name: /zoom out/i });
      const zoomToFitBtn = screen.getByRole('button', { name: /zoom to fit/i });
      const zoomValue = screen.getByRole('textbox', { name: /current zoom level/i });

      expect(zoomInBtn).toBeInTheDocument();
      expect(zoomOutBtn).toBeInTheDocument();
      expect(zoomToFitBtn).toBeInTheDocument();
      expect(zoomValue).toBeInTheDocument();
      expect(zoomValue).not.toHaveAttribute('readonly');

      await user.click(zoomInBtn);
      await user.click(zoomOutBtn);
      await user.click(zoomToFitBtn);
    });

    it('allows manual entry of valid zoom level, clamping it to valid range [10%, 200%]', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      const zoomValue = screen.getByRole('textbox', { name: /current zoom level/i });

      await user.clear(zoomValue);
      await user.type(zoomValue, '150{Enter}');
      expect(zoomValue).toHaveValue('150%');

      await user.clear(zoomValue);
      await user.type(zoomValue, '300{Enter}');
      expect(zoomValue).toHaveValue('200%');

      await user.clear(zoomValue);
      await user.type(zoomValue, '5{Enter}');
      expect(zoomValue).toHaveValue('10%');

      await user.clear(zoomValue);
      await user.type(zoomValue, 'invalid{Enter}');
      expect(zoomValue).toHaveValue('10%');
    });
  });

  describe('Canvas dimensions', () => {
    it('starts with default canvas dimensions of 1920×1080', () => {
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      expect(screen.getByRole('spinbutton', { name: /canvas width/i })).toHaveValue(1920);
      expect(screen.getByRole('spinbutton', { name: /canvas height/i })).toHaveValue(1080);
    });

    it('updates the other canvas dimension proportionally when aspect ratio lock is enabled', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      const wInput = screen.getByRole('spinbutton', { name: /canvas width/i });
      const hInput = screen.getByRole('spinbutton', { name: /canvas height/i });
      const lockBtn = screen.getByRole('button', { name: /lock aspect ratio/i });

      await user.click(lockBtn);
      expect(screen.getByRole('button', { name: /unlock aspect ratio/i })).toBeInTheDocument();

      await user.clear(wInput);
      await user.type(wInput, '960');
      expect(hInput).toHaveValue(540);

      await user.clear(hInput);
      await user.type(hInput, '270');
      expect(wInput).toHaveValue(480);
    });

    it('accepts a valid portrait dimension (1080×1920) and updates the canvas', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      const wInput = screen.getByRole('spinbutton', { name: /canvas width/i });
      const hInput = screen.getByRole('spinbutton', { name: /canvas height/i });

      await user.clear(wInput);
      await user.type(wInput, '1080');
      await user.clear(hInput);
      await user.type(hInput, '1920');
      await user.tab();

      expect(wInput).not.toHaveAttribute('aria-invalid', 'true');
      expect(document.querySelector('canvas')).toHaveAttribute('width', '3080'); // 1080 + 2000 padding
      expect(document.querySelector('canvas')).toHaveAttribute('height', '3920'); // 1920 + 2000 padding
    });

    it('rejects an invalid dimension (1920×1920) and keeps the last valid canvas size', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      const hInput = screen.getByRole('spinbutton', { name: /canvas height/i });

      await user.clear(hInput);
      await user.type(hInput, '1920');
      await user.tab();

      expect(hInput).toHaveAttribute('aria-invalid', 'true');
      // Canvas should retain the last valid dimensions plus 2000 padding
      expect(document.querySelector('canvas')).toHaveAttribute('width', '3920');
      expect(document.querySelector('canvas')).toHaveAttribute('height', '3080');
    });
  });

  describe('Upload flow', () => {
    it('calls onOverlayUploaded after a successful overlay upload', async () => {
      const user = userEvent.setup();
      const onOverlayUploaded = vi.fn();

      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={onOverlayUploaded}
        />
      );

      await user.click(screen.getByRole('button', { name: /save and submit/i }));

      await waitFor(() => expect(onOverlayUploaded).toHaveBeenCalledOnce());
    });

    it('shows an error message and does not call onOverlayUploaded when upload fails', async () => {
      vi.mocked(s3Service.uploadFile).mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();
      const onOverlayUploaded = vi.fn();

      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={onOverlayUploaded}
        />
      );

      await user.click(screen.getByRole('button', { name: /save and submit/i }));

      await waitFor(() =>
        expect(screen.getByText(/upload failed/i)).toBeInTheDocument()
      );
      expect(onOverlayUploaded).not.toHaveBeenCalled();
    });
  });

  describe('Sidebar collapsible', () => {
    it('can toggle the Layers panel open and closed', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      expect(screen.getByText('Layers')).toBeInTheDocument();

      const layersToggle = screen.getByRole('button', { name: /collapse layers panel/i });
      await user.click(layersToggle);
      expect(screen.queryByText('Layers')).not.toBeInTheDocument();

      const layersExpand = screen.getByRole('button', { name: /expand layers panel/i });
      await user.click(layersExpand);
      expect(screen.getByText('Layers')).toBeInTheDocument();
    });

    it('can toggle the Properties panel open and closed', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      expect(screen.getByText('Properties')).toBeInTheDocument();

      const propToggle = screen.getByRole('button', { name: /collapse properties panel/i });
      await user.click(propToggle);
      expect(screen.queryByText('Properties')).not.toBeInTheDocument();

      const propExpand = screen.getByRole('button', { name: /expand properties panel/i });
      await user.click(propExpand);
      expect(screen.getByText('Properties')).toBeInTheDocument();
    });
  });
});

describe('isValidDimension', () => {
  it('accepts valid landscape dimensions', () => {
    expect(isValidDimension(1920, 1080)).toBe(true);
    expect(isValidDimension(1280, 720)).toBe(true);
    expect(isValidDimension(1, 1)).toBe(true);
  });

  it('accepts valid portrait dimensions', () => {
    expect(isValidDimension(1080, 1920)).toBe(true);
    expect(isValidDimension(720, 1280)).toBe(true);
  });

  it('rejects dimensions that exceed the landscape limit', () => {
    expect(isValidDimension(1920, 1920)).toBe(false);
    expect(isValidDimension(1920, 1081)).toBe(false);
  });

  it('rejects dimensions that exceed the portrait limit', () => {
    expect(isValidDimension(1081, 1920)).toBe(false);
  });

  it('rejects out-of-range axis values', () => {
    expect(isValidDimension(0, 1080)).toBe(false);
    expect(isValidDimension(1920, 0)).toBe(false);
    expect(isValidDimension(1921, 1080)).toBe(false);
  });

  it('rejects non-integer values', () => {
    expect(isValidDimension(1920.5, 1080)).toBe(false);
  });
});
