import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CanvasDesignerIsland, { isValidDimension } from './CanvasDesignerIsland';
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
      expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
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
    it('shows Keep proportions checkbox only when an element is selected', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      expect(screen.queryByLabelText(/keep proportions/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^text$/i }));
      await user.click(screen.getByRole('button', { name: /select text/i }));

      expect(screen.getByLabelText(/keep proportions/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/keep proportions/i)).not.toBeChecked();

      await user.click(screen.getByLabelText(/keep proportions/i));
      expect(screen.getByLabelText(/keep proportions/i)).toBeChecked();
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
      expect(document.querySelector('canvas')).toHaveAttribute('width', '1080');
      expect(document.querySelector('canvas')).toHaveAttribute('height', '1920');
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
      expect(document.querySelector('canvas')).toHaveAttribute('width', '1920');
      expect(document.querySelector('canvas')).toHaveAttribute('height', '1080');
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

      await user.click(screen.getByRole('button', { name: /upload/i }));

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

      await user.click(screen.getByRole('button', { name: /upload/i }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(/upload failed/i)
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
