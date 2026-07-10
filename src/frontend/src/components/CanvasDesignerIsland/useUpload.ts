import { useState, type RefObject } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { uploadFile } from '../../upload/s3UploadService';
import type { UploadState } from '../../upload/uploadTypes';
import type { CanvasElement } from './canvasReducer';
import { drawElement } from './canvasRenderer';
import type { CanvasConfig } from './useCanvasConfig';

export interface UseUploadResult {
  uploadState: UploadState;
  errorMessage: string | null;
  handleUpload: () => Promise<void>;
}

export function useUpload(
  overlayPresignedUpload: PresignedUpload | null,
  canvasConfig: CanvasConfig,
  elements: CanvasElement[],
  imageCache: RefObject<Map<string, HTMLImageElement>>,
  onOverlayUploaded: () => void,
): UseUploadResult {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleUpload(): Promise<void> {
    if (!overlayPresignedUpload) return;
    setUploadState('uploading');
    setErrorMessage(null);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvasConfig.width;
    exportCanvas.height = canvasConfig.height;
    const exportCtx = exportCanvas.getContext('2d');

    if (!exportCtx) {
      setErrorMessage('Upload failed. Could not render canvas.');
      setUploadState('error');
      return;
    }

    for (const el of elements) {
      if (el.visible === false) continue;
      drawElement(exportCtx, el, imageCache.current, () => { });
    }

    await new Promise<void>((resolve) => {
      exportCanvas.toBlob(async (blob) => {
        if (!blob) {
          setErrorMessage('Upload failed. Could not render canvas.');
          setUploadState('error');
          resolve();
          return;
        }
        try {
          const file = new File([blob], 'overlay.png', { type: 'image/png' });
          await uploadFile(overlayPresignedUpload, file);
          setUploadState('done');
          onOverlayUploaded();
        } catch {
          setErrorMessage('Upload failed. Please try again.');
          setUploadState('error');
        }
        resolve();
      }, 'image/png');
    });
  }

  return { uploadState, errorMessage, handleUpload };
}
