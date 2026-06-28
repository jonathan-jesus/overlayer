import { useState, useRef } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { requestUploadUrls } from '../../api/apiClient';
import { uploadFile, FileSizeExceededError } from '../../upload/s3UploadService';
import type { UploadState } from '../../upload/uploadTypes';
import './UploaderIsland.css';

interface UploaderIslandProps {
  onVideoUploaded: (jobId: string, overlayPresignedUpload: PresignedUpload) => void;
  onComplete: (jobId: string) => void;
}

export default function UploaderIsland({ onVideoUploaded, onComplete }: UploaderIslandProps) {
  const [uiState, setUiState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  const [hasVideo, setHasVideo] = useState(false);

  function handleError(message: string) {
    setErrorMessage(message);
    setUiState('error');
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();

    const video = videoInputRef.current?.files?.[0];
    const overlay = overlayInputRef.current?.files?.[0] ?? null;

    if (!video) return;

    setUiState('uploading');
    setErrorMessage(null);

    try {
      const { jobId, videoUpload, overlayUpload } = await requestUploadUrls(crypto.randomUUID());

      await uploadFile(videoUpload, video);

      if (overlay) {
        await uploadFile(overlayUpload, overlay);
        setUiState('done');
        onComplete(jobId);
      } else {
        setUiState('done');
        onVideoUploaded(jobId, overlayUpload);
      }
    } catch (err) {
      if (err instanceof FileSizeExceededError) {
        handleError('File is too large. Please choose a smaller file.');
      } else {
        handleError('Upload failed. Please try again.');
      }
    }
  }

  return (
    <div className="uploader">
      <form className="uploader__form" onSubmit={handleSubmit}>
        <div
          className={`uploader__drop-zone ${uiState === 'uploading' ? 'uploader__drop-zone--uploading' : ''}`}
        >
          <div className="uploader__field">
            <label htmlFor="uploader-video" className="uploader__label">
              Video <span className="uploader__required">*</span>
            </label>
            <input
              id="uploader-video"
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="uploader__input"
              onChange={(e) => setHasVideo(!!e.target.files?.[0])}
              onInput={(e) => setHasVideo(!!(e.target as HTMLInputElement).files?.[0])}
              disabled={uiState === 'uploading'}
            />
          </div>

          <div className="uploader__field">
            <label htmlFor="uploader-overlay" className="uploader__label">
              Overlay image{' '}
              <span className="uploader__optional">(optional — or design one below)</span>
            </label>
            <input
              id="uploader-overlay"
              ref={overlayInputRef}
              type="file"
              accept="image/*"
              className="uploader__input"
              disabled={uiState === 'uploading'}
            />
          </div>
        </div>

        {errorMessage && (
          <p role="alert" className="uploader__error">
            {errorMessage}
          </p>
        )}

        {uiState === 'uploading' && (
          <div className="uploader__progress" aria-label="Uploading…">
            <div className="uploader__progress-bar" />
          </div>
        )}

        <button
          type="submit"
          className="uploader__submit"
          disabled={!hasVideo || uiState === 'uploading'}
        >
          {uiState === 'uploading' ? 'Uploading…' : 'Upload'}
        </button>
      </form>
    </div>
  );
}
