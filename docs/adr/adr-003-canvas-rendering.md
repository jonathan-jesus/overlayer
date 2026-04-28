# Architecture Decision Record (ADR)

### ADR 003: Client-Side Canvas Rendering

- **Context**
  The user can design an image overlay using an interactive canvas. The backend FFmpeg worker needs a raster image to composite onto the video. The question is where the responsibility of converting the canvas state into that image lives - on the client, or on the server.
- **Decision**
  The React frontend converts the HTML canvas to a PNG Blob in the browser and uploads it directly to S3. The backend never receives vector data, canvas coordinates, or any UI-layer representation of the overlay.
- **Consequences**
  The FFmpeg worker is reduced to a pure media processing unit - it composites two standard files (a video and a PNG) regardless of how the overlay was created. The backend is entirely decoupled from the frontend's rendering implementation. If the canvas designer is redesigned or replaced, the worker is unaffected. The trade-off is that any canvas-to-PNG conversion quality or resolution decisions are made client-side, which is appropriate since that is where the visual context exists.
