import { http, HttpResponse } from 'msw';
import { MOCK_S3_UPLOAD_URL } from '../mockConstants';

export const s3Handlers = [
  http.post(MOCK_S3_UPLOAD_URL, () => new HttpResponse(null, { status: 204 })),
];
