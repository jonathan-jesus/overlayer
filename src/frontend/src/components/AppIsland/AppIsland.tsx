import { useState } from 'react';
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
    <div className="app">
      <header className="app__hero">
        <h1 className="app__title gradient-text">Overlayer</h1>
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
