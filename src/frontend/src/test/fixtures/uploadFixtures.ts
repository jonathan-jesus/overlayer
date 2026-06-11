import type { RequestUploadUrlsResponse } from '../../api/apiClient';
import { MOCK_S3_BUCKET, MOCK_S3_REGION } from '../mockConstants';

export const mockPresignedUpload = {
    url: `/${MOCK_S3_BUCKET}`,
    maxFileSize: 104_857_600,
    fields: {
        key: 'jobs/session-id/job-id/video.mp4',
        contentType: 'video/mp4',
        policy: 'base64policy',
        xAmzAlgorithm: 'AWS4-HMAC-SHA256',
        xAmzCredential: `/20260101/${MOCK_S3_REGION}/s3/aws4_request`,
        xAmzDate: '20260101T000000Z',
        xAmzSignature: 'signature',
    },
};

export const mockUploadUrlsResponse: RequestUploadUrlsResponse = {
    jobId: 'test-job-id',
    videoUpload: mockPresignedUpload,
    overlayUpload: {
        ...mockPresignedUpload,
        fields: {
            ...mockPresignedUpload.fields,
            key: 'jobs/session-id/job-id/overlay.png',
            contentType: 'image/png',
        },
    },
};
