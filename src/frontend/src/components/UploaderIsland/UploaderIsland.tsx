import { useState, useRef } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { requestUploadUrls } from '../../api/apiClient';
import { uploadFile, FileSizeExceededError } from '../../upload/s3UploadService';
import type { UploadState } from '../../upload/uploadTypes';
import './UploaderIsland.css';

interface UploaderIslandProps {
  mode?: 'video' | 'overlay';
  jobId?: string;
  overlayPresignedUpload?: PresignedUpload;
  onVideoUploaded?: (jobId: string, overlayPresignedUpload: PresignedUpload) => void;
  onComplete?: (jobId: string) => void;
}

export default function UploaderIsland({
  mode = 'video',
  jobId,
  overlayPresignedUpload,
  onVideoUploaded,
  onComplete,
}: UploaderIslandProps) {
  const [uiState, setUiState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  const [hasFile, setHasFile] = useState(false);

  function handleError(message: string) {
    setErrorMessage(message);
    setUiState('error');
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();

    if (mode === 'video') {
      const video = videoInputRef.current?.files?.[0];
      if (!video) return;

      setUiState('uploading');
      setErrorMessage(null);

      try {
        const { jobId: newJobId, videoUpload, overlayUpload } = await requestUploadUrls(crypto.randomUUID());
        await uploadFile(videoUpload, video);
        setUiState('done');
        onVideoUploaded?.(newJobId, overlayUpload);
      } catch (err) {
        if (err instanceof FileSizeExceededError) {
          handleError('File is too large. Please choose a smaller file.');
        } else {
          handleError('Upload failed. Please try again.');
        }
      }
    } else {
      const overlay = overlayInputRef.current?.files?.[0];
      if (!overlay || !overlayPresignedUpload || !jobId) return;

      setUiState('uploading');
      setErrorMessage(null);

      try {
        await uploadFile(overlayPresignedUpload, overlay);
        setUiState('done');
        onComplete?.(jobId);
      } catch (err) {
        if (err instanceof FileSizeExceededError) {
          handleError('File is too large. Please choose a smaller file.');
        } else {
          handleError('Upload failed. Please try again.');
        }
      }
    }
  }

  return (
    <div className="uploader">
      <form className="uploader__form" onSubmit={handleSubmit}>
        <div
          className={`uploader__drop-zone ${uiState === 'uploading' ? 'uploader__drop-zone--uploading' : ''}`}
        >
          {mode === 'video' ? (
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
                onChange={(e) => setHasFile(!!e.target.files?.[0])}
                onInput={(e) => setHasFile(!!(e.target as HTMLInputElement).files?.[0])}
                disabled={uiState === 'uploading'}
              />
              <div className="uploader__file-hint">
                Max 10MB • MP4 (H.264) only • <span title="Must fit within 1920×1080 or 1080×1920" style={{ textDecoration: 'underline dotted', cursor: 'help' }}>Up to 1080p (16:9 or 9:16)</span>
              </div>
            </div>
          ) : (
            <div className="uploader__field">
              <label htmlFor="uploader-overlay" className="uploader__label">
                Overlay image <span className="uploader__required">*</span>
              </label>
              <input
                id="uploader-overlay"
                ref={overlayInputRef}
                type="file"
                accept="image/*"
                className="uploader__input"
                onChange={(e) => setHasFile(!!e.target.files?.[0])}
                onInput={(e) => setHasFile(!!(e.target as HTMLInputElement).files?.[0])}
                disabled={uiState === 'uploading'}
              />
              <div className="uploader__file-hint">
                Max 4MB • PNG only<br />
                💡 <strong>Tip:</strong> Match your video&apos;s resolution for best results (no automatic scaling).
              </div>
            </div>
          )}
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

        <div className="uploader__actions">
          {mode === 'video' && (
            <div className="uploader__hint">
              🛡️ Your content is safe and deleted weekly.
            </div>
          )}

          <button
            type="submit"
            className="uploader__submit"
            disabled={!hasFile || uiState === 'uploading'}
          >
            {mode === 'video'
              ? (uiState === 'uploading' ? 'Creating Job…' : 'Create Job')
              : (uiState === 'uploading' ? 'Uploading…' : 'Upload Image')}
          </button>
        </div>
      </form>
    </div>
  );
}
