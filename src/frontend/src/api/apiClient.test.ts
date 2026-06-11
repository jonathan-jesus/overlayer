import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { requestUploadUrls, listJobs } from './apiClient';
import { clearSessionId } from '../session/session';
import { apiHandlers } from '../test/handlers/apiHandlers';
import { mockUploadUrlsResponse } from '../test/fixtures/uploadFixtures';

const server = setupServer(...apiHandlers);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  clearSessionId();
});
afterAll(() => server.close());

describe('requestUploadUrls', () => {
  it('sends GET to the correct path with X-Session-ID header', async () => {
    let capturedRequest: Request | undefined;
    server.use(
      http.get('/api/jobs/:jobId/upload-urls', ({ request }) => {
        capturedRequest = request;
        return HttpResponse.json(mockUploadUrlsResponse);
      })
    );

    await requestUploadUrls('test-job-id');

    expect(capturedRequest?.method).toBe('GET');
    expect(capturedRequest?.headers.get('X-Session-ID')).toBeTruthy();
  });

  it('returns the typed upload URL response', async () => {
    const result = await requestUploadUrls('test-job-id');

    expect(result.jobId).toBe('test-job-id');
    expect(result.videoUpload.url).toBeTruthy();
    expect(result.videoUpload.fields.key).toBeTruthy();
    expect(result.overlayUpload.fields.contentType).toBe('image/png');
  });

  it('throws on a non-2xx response', async () => {
    server.use(
      http.get('/api/jobs/:jobId/upload-urls', () =>
        HttpResponse.json({ error: 'Bad Request' }, { status: 400 })
      )
    );

    await expect(requestUploadUrls('bad-id')).rejects.toThrow('API error: 400');
  });
});

describe('listJobs', () => {
  it('sends GET to /api/jobs with X-Session-ID header', async () => {
    let capturedRequest: Request | undefined;
    server.use(
      http.get('/api/jobs', ({ request }) => {
        capturedRequest = request;
        return HttpResponse.json({ jobs: [] });
      })
    );

    await listJobs();

    expect(capturedRequest?.method).toBe('GET');
    expect(capturedRequest?.headers.get('X-Session-ID')).toBeTruthy();
  });

  it('returns the typed jobs response', async () => {
    server.use(
      http.get('/api/jobs', () =>
        HttpResponse.json({
          jobs: [
            {
              jobId: 'j1',
              status: 'COMPLETED',
              createdAt: '2026-01-01T00:00:00Z',
              downloadUrl: 'https://cdn.example.com/j1.mp4',
            },
          ],
        })
      )
    );

    const result = await listJobs();

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].status).toBe('COMPLETED');
    expect(result.jobs[0].downloadUrl).toBe('https://cdn.example.com/j1.mp4');
  });

  it('handles an empty jobs array', async () => {
    const result = await listJobs();
    expect(result.jobs).toEqual([]);
  });

  it('throws on a non-2xx response', async () => {
    server.use(
      http.get('/api/jobs', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    );

    await expect(listJobs()).rejects.toThrow('API error: 401');
  });
});
