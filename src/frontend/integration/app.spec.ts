import { test, expect, type Page } from '@playwright/test';
import { mockUploadUrlsResponse as baseMockUploadUrlsResponse } from '../src/test/fixtures/uploadFixtures';
import { MOCK_S3_UPLOAD_URL } from '../src/test/mockConstants';

const MOCK_JOB_ID = 'e2e-test-job-id';
const MOCK_S3_URL = MOCK_S3_UPLOAD_URL;

const mockUploadUrlsResponse = {
  ...baseMockUploadUrlsResponse,
  jobId: MOCK_JOB_ID,
};



async function mockApiRoutes(page: Page) {
  await page.route('**/api/jobs/*/upload-urls', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUploadUrlsResponse) })
  );
  await page.route(MOCK_S3_URL + '*', (route) =>
    route.fulfill({
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }
    })
  );
}

async function mockJobStatus(page: Page, status: 'PROCESSING' | 'COMPLETED', callCount = { n: 0 }) {
  await page.route('**/api/jobs', (route) => {
    callCount.n++;
    const jobStatus = callCount.n >= 2 ? status : 'PROCESSING';
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jobs: [{
          jobId: MOCK_JOB_ID,
          status: jobStatus,
          createdAt: '2026-01-01T00:00:00Z',
          ...(jobStatus === 'COMPLETED' ? { downloadUrl: 'https://cdn.example.com/result.mp4' } : {}),
        }],
      }),
    });
  });
}


test.describe('Page load', () => {
  test('renders uploader; canvas is locked; job status is absent', async ({ page }) => {
    await mockApiRoutes(page);
    await mockJobStatus(page, 'PROCESSING');

    await page.goto('/');
    await page.locator('[data-hydrated="true"]').waitFor();

    await expect(page.getByRole('region', { name: 'Upload files' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Design overlay' })).not.toBeVisible();
    await expect(page.getByRole('region', { name: 'Processing status' })).not.toBeVisible();
  });
});

test.describe('Happy path: video + overlay image', () => {
  test('uploads both files and shows completed download link', async ({ page }) => {
    await mockApiRoutes(page);
    const callCount = { n: 0 };
    await mockJobStatus(page, 'COMPLETED', callCount);

    await page.goto('/');
    await page.locator('[data-hydrated="true"]').waitFor();

    const videoInput = page.locator('#uploader-video');
    await videoInput.setInputFiles({
      name: 'sample.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake-video'),
    });

    const overlayInput = page.locator('#uploader-overlay');
    await overlayInput.setInputFiles({
      name: 'overlay.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image'),
    });

    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByRole('region', { name: 'Processing status' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 25_000 });
  });
});

test.describe('Happy path: video only → canvas design', () => {
  test('unlocks canvas after video upload, then processes after overlay upload', async ({ page }) => {
    await mockApiRoutes(page);
    const callCount = { n: 0 };
    await mockJobStatus(page, 'COMPLETED', callCount);

    await page.goto('/');
    await page.locator('[data-hydrated="true"]').waitFor();

    const videoInput = page.locator('#uploader-video');
    await videoInput.setInputFiles({
      name: 'sample.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake-video'),
    });

    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByRole('region', { name: 'Design overlay' })).toBeVisible();

    const canvasDesigner = page.getByLabel('Canvas designer');
    await expect(canvasDesigner).not.toHaveAttribute('aria-disabled', 'true');

    await page.getByRole('button', { name: 'Text' }).click();

    await page.getByRole('button', { name: 'Upload', exact: true }).click();

    await expect(page.getByRole('region', { name: 'Processing status' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 25_000 });
  });
});

test.describe('Upload error', () => {
  test('shows error message when API returns 500', async ({ page }) => {
    await page.route('**/api/jobs/*/upload-urls', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' })
    );

    await page.goto('/');
    await page.locator('[data-hydrated="true"]').waitFor();

    const videoInput = page.locator('#uploader-video');
    await videoInput.setInputFiles({
      name: 'sample.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake-video'),
    });

    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByRole('alert')).toContainText('Upload failed');
  });
});
