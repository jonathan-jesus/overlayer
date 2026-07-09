import { useState, useEffect, useRef } from 'react';
import type { PresignedUpload } from '../../api/apiClient';
import UploaderIsland from '../UploaderIsland/UploaderIsland';
import CanvasDesignerIsland from '../CanvasDesignerIsland/CanvasDesignerIsland';
import JobStatusIsland from '../JobStatusIsland/JobStatusIsland';
import './AppIsland.css';

type AppState =
  | { stage: 'upload' }
  | { stage: 'design'; jobId: string; overlayPresignedUpload: PresignedUpload }
  | { stage: 'processing'; jobId: string };

export default function AppIsland() {
  const [appState, setAppState] = useState<AppState>({ stage: 'upload' });
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (appRef.current) appRef.current.dataset.hydrated = 'true';
  }, []);

  function handleVideoUploaded(jobId: string, overlayPresignedUpload: PresignedUpload) {
    setAppState({ stage: 'design', jobId, overlayPresignedUpload });
  }

  function handleComplete(jobId: string) {
    setAppState({ stage: 'processing', jobId });
  }

  function handleOverlayUploaded() {
    if (appState.stage === 'design') {
      setAppState({ stage: 'processing', jobId: appState.jobId });
    }
  }

  const overlayPresignedUpload =
    appState.stage === 'design' ? appState.overlayPresignedUpload : null;

  return (
    <div className="app" ref={appRef}>
      <div className="showcase-toast glass">
        <p>👋 <strong>Welcome to Overlayer!</strong> Just a quick heads-up: this is a showcase project, so our servers take a quick nap when not in use. If it takes a minute or two to wake up on your first try, thanks for your patience! We&apos;ve enabled anonymous access so you can jump right in.</p>
      </div>

      <header className="app__hero">
        <div className="app__title-container">
          <div className="app__icon" aria-hidden="true"></div>
          <h1 className="app__title gradient-text">Overlayer</h1>
        </div>
        <p className="app__tagline">Seamlessly drop graphics and text straight onto your videos.</p>
      </header>

      <main className="app__content">
        {appState.stage === 'upload' && (
          <section className="app__section" aria-label="Upload files">
            <h2 className="app__section-title">Upload your files</h2>
            <UploaderIsland
              onVideoUploaded={handleVideoUploaded}
              onComplete={handleComplete}
            />
          </section>
        )}

        {appState.stage === 'design' && (
          <>
            <section className="app__section app__section--wide" aria-label="Design overlay">
              <h2 className="app__section-title">Design your overlay</h2>
              <p className="app__section-description">
                Add text elements to the canvas, then upload your overlay to start processing.
              </p>
              <CanvasDesignerIsland
                overlayPresignedUpload={overlayPresignedUpload}
                onOverlayUploaded={handleOverlayUploaded}
              />
            </section>
          </>
        )}

        {appState.stage === 'processing' && (
          <section className="app__section" aria-label="Processing status">
            <h2 className="app__section-title">Processing your video</h2>
            <JobStatusIsland jobId={appState.jobId} />
          </section>
        )}
      </main>
    </div>
  );
}
