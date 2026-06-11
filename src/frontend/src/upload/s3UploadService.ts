import type { PresignedUpload } from '../api/apiClient';

export class FileSizeExceededError extends Error {
  constructor(fileSize: number, maxFileSize: number) {
    super(`File size ${fileSize} exceeds the maximum allowed size of ${maxFileSize} bytes`);
    this.name = 'FileSizeExceededError';
  }
}

export class S3UploadError extends Error {
  constructor(status: number, statusText: string) {
    super(`S3 upload failed: ${status} ${statusText}`);
    this.name = 'S3UploadError';
  }
}

export function buildS3Url(presignedUpload: PresignedUpload): string {
  const bucket = presignedUpload.url.replace(/^\//, '');

  const credentialParts = presignedUpload.fields.xAmzCredential.split('/').filter(Boolean);
  const s3Index = credentialParts.indexOf('s3');
  if (s3Index < 1) {
    throw new Error(`Cannot parse region from xAmzCredential: ${presignedUpload.fields.xAmzCredential}`);
  }
  const region = credentialParts[s3Index - 1];

  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

export async function uploadFile(presignedUpload: PresignedUpload, file: File): Promise<void> {
  if (file.size > presignedUpload.maxFileSize) {
    throw new FileSizeExceededError(file.size, presignedUpload.maxFileSize);
  }

  const { fields } = presignedUpload;
  const formData = new FormData();
  formData.append('key', fields.key);
  formData.append('Content-Type', fields.contentType);
  formData.append('policy', fields.policy);
  formData.append('X-Amz-Algorithm', fields.xAmzAlgorithm);
  formData.append('X-Amz-Credential', fields.xAmzCredential);
  formData.append('X-Amz-Date', fields.xAmzDate);
  formData.append('X-Amz-Signature', fields.xAmzSignature);
  if (fields.xAmzSecurityToken) {
    formData.append('X-Amz-Security-Token', fields.xAmzSecurityToken);
  }
  formData.append('file', file);

  const response = await fetch(buildS3Url(presignedUpload), {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new S3UploadError(response.status, response.statusText);
  }
}
