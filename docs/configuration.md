# API Configuration

The API requires an S3-compatible storage service for asset storage.

### Environment Variables

| Variable             | Maps to             | Notes                   |
| -------------------- | ------------------- | ----------------------- |
| `S3__BucketName`     | `S3.BucketName`     | Required                |
| `S3__Region`         | `S3.Region`         | Defaults to `us-east-2` |
| `S3__AccessKey`      | `S3.AccessKey`      | Local development only  |
| `S3__SecretKey`      | `S3.SecretKey`      | Local development only  |
| `S3__ServiceUrl`     | `S3.ServiceUrl`     | LocalStack only         |
| `S3__ForcePathStyle` | `S3.ForcePathStyle` | LocalStack only         |

---
