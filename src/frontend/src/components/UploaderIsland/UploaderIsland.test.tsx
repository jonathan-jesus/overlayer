import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { apiHandlers } from '../../test/handlers/apiHandlers';
import { mockUploadUrlsResponse } from '../../test/fixtures/uploadFixtures';
import { s3Handlers } from '../../test/handlers/s3Handlers';
import { MOCK_S3_UPLOAD_URL } from '../../test/mockConstants';
import UploaderIsland from './UploaderIsland';

const server = setupServer(...apiHandlers, ...s3Handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const onVideoUploaded = vi.fn();
const onComplete = vi.fn();

function renderUploader() {
  return render(
    <UploaderIsland onVideoUploaded={onVideoUploaded} onComplete={onComplete} />
  );
}

function makeVideoFile(sizeBytes = 1024) {
  return new File([new ArrayBuffer(sizeBytes)], 'clip.mp4', { type: 'video/mp4' });
}

function makeOverlayFile(sizeBytes = 512) {
  return new File([new ArrayBuffer(sizeBytes)], 'overlay.png', { type: 'image/png' });
}

afterEach(() => {
  onVideoUploaded.mockReset();
  onComplete.mockReset();
});

describe('UploaderIsland', () => {
  it('renders idle state with submit button disabled', () => {
    renderUploader();

    expect(screen.getByRole('button', { name: /upload/i })).toBeDisabled();
  });

  it('enables submit once a video file is selected', async () => {
    const user = userEvent.setup();
    renderUploader();

    const videoInput = screen.getByLabelText(/video/i);
    await user.upload(videoInput, makeVideoFile());

    expect(screen.getByRole('button', { name: /upload/i })).toBeEnabled();
  });

  it('calls onVideoUploaded with jobId and overlayPresignedUpload when only video is uploaded', async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.upload(screen.getByLabelText(/video/i), makeVideoFile());
    await user.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() => expect(onVideoUploaded).toHaveBeenCalledOnce());

    const [jobId, overlayPresignedUpload] = onVideoUploaded.mock.calls[0];
    expect(typeof jobId).toBe('string');
    expect(overlayPresignedUpload).toMatchObject(mockUploadUrlsResponse.overlayUpload);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('calls onComplete (not onVideoUploaded) when both video and overlay are uploaded', async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.upload(screen.getByLabelText(/video/i), makeVideoFile());
    await user.upload(screen.getByLabelText(/overlay/i), makeOverlayFile());
    await user.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(onVideoUploaded).not.toHaveBeenCalled();
  });

  it('shows an error and does not upload when video exceeds maxFileSize', async () => {
    const user = userEvent.setup();
    renderUploader();

    const oversizedVideo = makeVideoFile(mockUploadUrlsResponse.videoUpload.maxFileSize + 1);
    await user.upload(screen.getByLabelText(/video/i), oversizedVideo);
    await user.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/too large/i)
    );
    expect(onComplete).not.toHaveBeenCalled();
    expect(onVideoUploaded).not.toHaveBeenCalled();
  });

  it('shows an error and does not upload when overlay exceeds maxFileSize', async () => {
    const user = userEvent.setup();
    renderUploader();

    const oversizedOverlay = makeOverlayFile(mockUploadUrlsResponse.overlayUpload.maxFileSize + 1);
    await user.upload(screen.getByLabelText(/video/i), makeVideoFile());
    await user.upload(screen.getByLabelText(/overlay/i), oversizedOverlay);
    await user.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/too large/i)
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('shows an error when the API request for upload URLs fails', async () => {
    server.use(
      http.get('/api/jobs/:jobId/upload-urls', () =>
        new HttpResponse(null, { status: 500 })
      )
    );

    const user = userEvent.setup();
    renderUploader();

    await user.upload(screen.getByLabelText(/video/i), makeVideoFile());
    await user.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/upload failed/i)
    );
  });

  it('shows an error when the S3 upload fails', async () => {
    server.use(
      http.post(MOCK_S3_UPLOAD_URL, () => new HttpResponse(null, { status: 403 }))
    );

    const user = userEvent.setup();
    renderUploader();

    await user.upload(screen.getByLabelText(/video/i), makeVideoFile());
    await user.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/upload failed/i)
    );
  });
});
