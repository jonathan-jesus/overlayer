import { useState, useEffect, useRef } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import { requestUploadUrls, RateLimitError } from '../../api/apiClient';
import UploaderIsland from '../UploaderIsland/UploaderIsland';
import CanvasDesignerIsland from '../CanvasDesignerIsland/CanvasDesignerIsland';
import JobListingPanel from '../JobListingPanel/JobListingPanel';
import './AppIsland.css';

type AppState =
  | { stage: 'upload' }
  | { stage: 'design'; jobId: string; overlayPresignedUpload: PresignedUpload };

export default function AppIsland() {
  const [appState, setAppState] = useState<AppState>({ stage: 'upload' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const appRef = useRef<HTMLDivElement>(null);

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3500);
  }

  useEffect(() => {
    if (appRef.current) appRef.current.dataset.hydrated = 'true';
  }, []);

  function handleVideoUploaded(jobId: string, overlayPresignedUpload: PresignedUpload) {
    setAppState({ stage: 'design', jobId, overlayPresignedUpload });
  }

  function handleOverlayUploaded() {
    setAppState({ stage: 'upload' });
  }

  async function handleResumeDesign(jobId: string) {
    try {
      const response = await requestUploadUrls(jobId);
      setAppState({ stage: 'design', jobId, overlayPresignedUpload: response.overlayUpload });
    } catch (e) {
      if (e instanceof RateLimitError) {
        showToast(`Too many requests. Please try again after ${Math.ceil(e.retryAfterMs / 1000)} seconds.`);
      } else {
        showToast('Failed to resume design. Please try again.');
      }
      console.error('Failed to resume design:', e);
    }
  }

  const overlayPresignedUpload =
    appState.stage === 'design' ? appState.overlayPresignedUpload : null;

  return (
    <div className="app" ref={appRef}>
      <header className="app__hero">
        <div className="app__hero-left">
          <div className="app__title-container">
            <div className="app__icon" aria-hidden="true"></div>
            <h1 className="app__title gradient-text">Overlayer</h1>
          </div>
          <p className="app__tagline">Seamlessly drop graphics and text straight onto your videos.</p>
        </div>

        <div className="app__hero-right">
          <div className="showcase-toast glass">
            <p>👋 <strong>Welcome to Overlayer!</strong> Just a quick heads-up: this is a showcase project, so our servers take a quick nap when not in use. If it takes a minute or two to wake up on your first try, thanks for your patience! We&apos;ve enabled anonymous access so you can jump right in.</p>
          </div>
        </div>
      </header>

      <main className="app__content">
        {appState.stage === 'upload' && (
          <section className="app__section" aria-label="Create job">
            <h2 className="app__section-title">New job</h2>
            <UploaderIsland
              mode="video"
              onVideoUploaded={handleVideoUploaded}
            />
          </section>
        )}

        {appState.stage === 'upload' && <JobListingPanel onActionDesign={handleResumeDesign} />}

        {appState.stage === 'design' && (
          <section className="app__section app__section--wide" aria-label="Design overlay">
            <h2 className="app__section-title">Design your overlay or upload a pre-made one</h2>
            <p className="app__section-description">
              Upload an existing PNG or add text elements to the canvas to start processing.
            </p>
            <div className="app__design-split" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <UploaderIsland
                mode="overlay"
                jobId={appState.jobId}
                overlayPresignedUpload={overlayPresignedUpload ?? undefined}
                onComplete={handleOverlayUploaded}
              />
              <CanvasDesignerIsland
                overlayPresignedUpload={overlayPresignedUpload}
                onOverlayUploaded={handleOverlayUploaded}
              />
              <button
                onClick={() => setAppState({ stage: 'upload' })}
                className="app__cancel-button"
              >
                Cancel
              </button>
            </div>
          </section>
        )}
      </main>

      {toastMessage && (
        <div className="app__toast" role="alert">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
