import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { uploadFile, buildS3Url, FileSizeExceededError, S3UploadError } from './s3UploadService';
import type { PresignedUpload } from '../api/apiClient';
import { s3Handlers } from '../test/handlers/s3Handlers';

const server = setupServer(...s3Handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

import { mockPresignedUpload } from '../test/fixtures/uploadFixtures';
import { MOCK_S3_UPLOAD_URL } from '../test/mockConstants';

const presignedUpload: PresignedUpload = {
  ...mockPresignedUpload,
  maxFileSize: 100,
};

function makeFile(sizeBytes: number, type = 'video/mp4'): File {
  return new File([new Uint8Array(sizeBytes)], 'test.mp4', { type });
}

describe('buildS3Url', () => {
  it('constructs the correct URL from a partial url and credential without access key prefix', () => {
    expect(buildS3Url(presignedUpload)).toBe(
      MOCK_S3_UPLOAD_URL
    );
  });

  it('constructs the correct URL when xAmzCredential includes an access key prefix', () => {
    const upload: PresignedUpload = {
      ...presignedUpload,
      url: '/my-bucket',
      fields: {
        ...presignedUpload.fields,
        xAmzCredential: 'AKIAIOSFODNN7EXAMPLE/20260613/us-east-1/s3/aws4_request',
      },
    };
    expect(buildS3Url(upload)).toBe('https://my-bucket.s3.us-east-1.amazonaws.com');
  });

  it('uses the region from the credential for a different region', () => {
    const upload: PresignedUpload = {
      ...presignedUpload,
      url: '/prod-bucket',
      fields: {
        ...presignedUpload.fields,
        xAmzCredential: '/20260101/ap-southeast-1/s3/aws4_request',
      },
    };
    expect(buildS3Url(upload)).toBe('https://prod-bucket.s3.ap-southeast-1.amazonaws.com');
  });
});

describe('uploadFile', () => {
  it('builds the correct FormData fields', async () => {
    // MSW's internal undici parser crashes on a jsdom File inside a FormData body
    // so we spy on fetch directly instead of using server.use()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }));

    await uploadFile(presignedUpload, makeFile(50));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchSpy.mock.calls[0];
    const capturedFormData = options?.body as FormData;

    expect(calledUrl).toBe(MOCK_S3_UPLOAD_URL);

    const { fields } = presignedUpload;
    expect(capturedFormData?.get('key')).toBe(fields.key);
    expect(capturedFormData?.get('Content-Type')).toBe(fields.contentType);
    expect(capturedFormData?.get('policy')).toBe(fields.policy);
    expect(capturedFormData?.get('X-Amz-Algorithm')).toBe(fields.xAmzAlgorithm);
    expect(capturedFormData?.get('X-Amz-Credential')).toBe(fields.xAmzCredential);
    expect(capturedFormData?.get('X-Amz-Date')).toBe(fields.xAmzDate);
    expect(capturedFormData?.get('X-Amz-Signature')).toBe(fields.xAmzSignature);
    expect(capturedFormData?.get('file')).toBeInstanceOf(File);

    fetchSpy.mockRestore();
  });

  it('resolves on a 204 response from S3', async () => {
    server.use(
      http.post(MOCK_S3_UPLOAD_URL, () =>
        new HttpResponse(null, { status: 204 })
      )
    );
    await expect(uploadFile(presignedUpload, makeFile(50))).resolves.toBeUndefined();
  });

  it('rejects with FileSizeExceededError without making a network call when file exceeds maxFileSize', async () => {
    let networkCallMade = false;
    server.use(
      http.post(MOCK_S3_UPLOAD_URL, () => {
        networkCallMade = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    await expect(uploadFile(presignedUpload, makeFile(200))).rejects.toThrow(FileSizeExceededError);
    expect(networkCallMade).toBe(false);
  });

  it('rejects with S3UploadError on a non-2xx S3 response', async () => {
    server.use(
      http.post(MOCK_S3_UPLOAD_URL, () =>
        new HttpResponse(null, { status: 403 })
      )
    );

    await expect(uploadFile(presignedUpload, makeFile(50))).rejects.toThrow(S3UploadError);
  });
});
