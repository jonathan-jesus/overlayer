import { http, HttpResponse } from 'msw';
import type { JobsResponse } from '../../api/apiClient';
import { mockUploadUrlsResponse } from '../fixtures/uploadFixtures';

export const apiHandlers = [
  http.get('/api/jobs/:jobId/upload-urls', () =>
    HttpResponse.json(mockUploadUrlsResponse)
  ),
  http.get('/api/jobs', () => HttpResponse.json<JobsResponse>({ jobs: [] })),
];
