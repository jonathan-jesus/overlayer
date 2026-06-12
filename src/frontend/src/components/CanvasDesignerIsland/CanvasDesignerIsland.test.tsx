import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CanvasDesignerIsland from './CanvasDesignerIsland';
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
      expect(screen.queryByRole('button', { name: /upload overlay/i })).not.toBeInTheDocument();
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
    it('adds a text element to the list when "Add Text" is clicked', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: /add text/i }));

      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });

    it('removes a text element when its delete button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <CanvasDesignerIsland
          overlayPresignedUpload={mockOverlayUpload}
          onOverlayUploaded={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: /add text/i }));
      expect(screen.getAllByRole('listitem')).toHaveLength(1);

      await user.click(screen.getByRole('button', { name: /delete/i }));
      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
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

      await user.click(screen.getByRole('button', { name: /upload overlay/i }));

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

      await user.click(screen.getByRole('button', { name: /upload overlay/i }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(/upload failed/i)
      );
      expect(onOverlayUploaded).not.toHaveBeenCalled();
    });
  });
});
