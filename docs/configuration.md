# Configuration

## API Configuration

The API requires an S3-compatible storage service for asset storage.

### Environment Variables

| Variable                           | Maps to                           | Notes                                                                        |
| ---------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `S3__BucketName`                   | `S3.BucketName`                   | Required                                                                     |
| `S3__Region`                       | `S3.Region`                       | Defaults to `us-east-2`                                                      |
| `S3__AccessKey`                    | `S3.AccessKey`                    | Local development only                                                       |
| `S3__SecretKey`                    | `S3.SecretKey`                    | Local development only                                                       |
| `S3__ServiceUrl`                   | `S3.ServiceUrl`                   | LocalStack only                                                              |
| `S3__ForcePathStyle`               | `S3.ForcePathStyle`               | LocalStack only                                                              |
| `Uploads__VideoMaxFileSizeBytes`   | `Uploads.VideoMaxFileSizeBytes`   | Maximum allowed size for video uploads. Defaulst to `10485760` (10 MB)       |
| `Uploads__OverlayMaxFileSizeBytes` | `Uploads.OverlayMaxFileSizeBytes` | Maximum allowed size for overlay image uploads. Defaults to `4194304` (4 MB) |

---

## Worker Configuration

The Worker requires configuration for Amazon SQS, Amazon S3 and standard AWS SDK.

### Environment Variables

| Variable               | Maps to               | Notes                                                            |
| ---------------------- | --------------------- | ---------------------------------------------------------------- |
| `SQS__QueueUrl`        | `SQS.QueueUrl`        | Required. URL of the Amazon SQS queue polled for background jobs |
| `SQS__WaitTimeSeconds` | `SQS.WaitTimeSeconds` | Optional. Long-polling wait time in seconds. Defaults to `20`    |
| `S3__BucketName`       | `S3.BucketName`       | Required. Name of the bucket for inputs/outputs/locks.           |
| `AWS__Region`          | `AWS.Region`          | Optional. AWS region for the worker environment                  |
| `AWS__Profile`         | `AWS.Profile`         | Local development only                                           |
| `AWS__ServiceURL`      | `AWS.ServiceURL`      | LocalStack LocalStack only                                       |

---
