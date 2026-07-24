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
  it('builds the correct FormData fields and tracks progress', async () => {
    // MSW's internal undici parser crashes on a jsdom File inside a FormData body
    // so we stub XMLHttpRequest directly instead of using server.use()
    const xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      addEventListener: vi.fn(),
      upload: { addEventListener: vi.fn() },
      status: 204
    };
    class MockXHR {
      open = xhrMock.open;
      send = xhrMock.send;
      addEventListener = xhrMock.addEventListener;
      upload = xhrMock.upload;
      get status() { return xhrMock.status; }
    }
    vi.stubGlobal('XMLHttpRequest', MockXHR);

    const onProgress = vi.fn();
    const promise = uploadFile(presignedUpload, makeFile(50), onProgress);

    expect(xhrMock.open).toHaveBeenCalledWith('POST', MOCK_S3_UPLOAD_URL, true);

    const formData = xhrMock.send.mock.calls[0][0] as FormData;
    const { fields } = presignedUpload;
    expect(formData.get('key')).toBe(fields.key);
    expect(formData.get('Content-Type')).toBe(fields.contentType);
    expect(formData.get('policy')).toBe(fields.policy);
    expect(formData.get('X-Amz-Algorithm')).toBe(fields.xAmzAlgorithm);
    expect(formData.get('X-Amz-Credential')).toBe(fields.xAmzCredential);
    expect(formData.get('X-Amz-Date')).toBe(fields.xAmzDate);
    expect(formData.get('X-Amz-Signature')).toBe(fields.xAmzSignature);
    expect(formData.get('file')).toBeInstanceOf(File);

    // Simulate progress event
    const progressHandler = xhrMock.upload.addEventListener.mock.calls.find((call) => call[0] === 'progress')?.[1];
    progressHandler({ lengthComputable: true, loaded: 25, total: 50 });
    expect(onProgress).toHaveBeenCalledWith(50);

    // Simulate load event
    const loadHandler = xhrMock.addEventListener.mock.calls.find((call) => call[0] === 'load')?.[1];
    loadHandler();

    await expect(promise).resolves.toBeUndefined();

    vi.unstubAllGlobals();
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
