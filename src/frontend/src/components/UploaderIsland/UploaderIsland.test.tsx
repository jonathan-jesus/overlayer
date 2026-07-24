import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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

    expect(screen.getByRole('button', { name: /create job/i })).toBeDisabled();
  });

  it('enables submit once a video file is selected', async () => {
    const user = userEvent.setup();
    renderUploader();

    const videoInput = screen.getByLabelText(/video/i);
    await user.upload(videoInput, makeVideoFile());

    expect(screen.getByRole('button', { name: /create job/i })).toBeEnabled();
  });

  it('calls onVideoUploaded with jobId and overlayPresignedUpload when only video is uploaded', async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.upload(screen.getByLabelText(/video/i), makeVideoFile());
    await user.click(screen.getByRole('button', { name: /create job/i }));

    await waitFor(() => expect(onVideoUploaded).toHaveBeenCalledOnce());

    const [jobId, overlayPresignedUpload] = onVideoUploaded.mock.calls[0];
    expect(typeof jobId).toBe('string');
    expect(overlayPresignedUpload).toMatchObject(mockUploadUrlsResponse.overlayUpload);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('calls onComplete (not onVideoUploaded) when both video and overlay are uploaded', async () => {
    const user = userEvent.setup();
    const { rerender } = renderUploader();

    await user.upload(screen.getByLabelText(/video/i), makeVideoFile());
    await user.click(screen.getByRole('button', { name: /create job/i }));

    rerender(
      <UploaderIsland
        mode="overlay"
        jobId="test-job"
        overlayPresignedUpload={mockUploadUrlsResponse.overlayUpload}
        onVideoUploaded={onVideoUploaded}
        onComplete={onComplete}
      />
    );

    await user.upload(screen.getByLabelText(/overlay image/i), makeOverlayFile());
    await user.click(screen.getByRole('button', { name: /upload image/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(onVideoUploaded).toHaveBeenCalledOnce();
  });

  it('shows an error and does not upload when video exceeds maxFileSize', async () => {
    const user = userEvent.setup();
    renderUploader();

    const oversizedVideo = makeVideoFile(mockUploadUrlsResponse.videoUpload.maxFileSize + 1);
    await user.upload(screen.getByLabelText(/video/i), oversizedVideo);
    await user.click(screen.getByRole('button', { name: /create job/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/too large/i)
    );
    expect(onComplete).not.toHaveBeenCalled();
    expect(onVideoUploaded).not.toHaveBeenCalled();
  });

  it('shows an error and does not upload when overlay exceeds maxFileSize', async () => {
    const user = userEvent.setup();
    const { rerender } = renderUploader();

    const oversizedOverlay = makeOverlayFile(mockUploadUrlsResponse.overlayUpload.maxFileSize + 1);
    await user.upload(screen.getByLabelText(/video/i), makeVideoFile());
    await user.click(screen.getByRole('button', { name: /create job/i }));

    rerender(
      <UploaderIsland
        mode="overlay"
        jobId="test-job"
        overlayPresignedUpload={mockUploadUrlsResponse.overlayUpload}
        onVideoUploaded={onVideoUploaded}
        onComplete={onComplete}
      />
    );

    await user.upload(screen.getByLabelText(/overlay image/i), oversizedOverlay);
    await user.click(screen.getByRole('button', { name: /upload image/i }));

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
    await user.click(screen.getByRole('button', { name: /create job/i }));

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
    await user.click(screen.getByRole('button', { name: /create job/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/upload failed/i)
    );
  });

  it('updates progress bar width during upload', async () => {
    const xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      addEventListener: vi.fn(),
      upload: { addEventListener: vi.fn() },
      status: 204
    };
    class MockXHR {
      open = xhrMock.open;
      send = xhrMock.send;
      addEventListener = xhrMock.addEventListener;
      upload = xhrMock.upload;
      get status() { return xhrMock.status; }
    }
    vi.stubGlobal('XMLHttpRequest', MockXHR);

    const user = userEvent.setup();
    renderUploader();

    await user.upload(screen.getByLabelText(/video/i), makeVideoFile());
    await user.click(screen.getByRole('button', { name: /create job/i }));

    // Wait for the progress bar container to appear
    const progressBarContainer = await screen.findByLabelText(/Uploading…/i);
    const innerBar = progressBarContainer.querySelector('.uploader__progress-bar') as HTMLElement;

    expect(innerBar.style.width).toBe('0%');

    // Wait for XMLHttpRequest to be initialized by the upload function
    await waitFor(() => {
      expect(xhrMock.upload.addEventListener).toHaveBeenCalled();
    });

    // Simulate progress
    const progressHandler = xhrMock.upload.addEventListener.mock.calls.find((call: unknown[]) => call[0] === 'progress')?.[1] as (event: unknown) => void;
    if (progressHandler) {
      act(() => {
        progressHandler({ lengthComputable: true, loaded: 50, total: 100 });
      });
    }

    await waitFor(() => {
      expect(innerBar.style.width).toBe('50%');
    });

    // Simulate load
    const loadHandler = xhrMock.addEventListener.mock.calls.find((call: unknown[]) => call[0] === 'load')?.[1] as () => void;
    if (loadHandler) {
      act(() => {
        loadHandler();
      });
    }

    await waitFor(() => expect(onVideoUploaded).toHaveBeenCalledOnce());

    vi.unstubAllGlobals();
  });
});
