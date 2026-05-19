using Amazon.S3;
using Amazon.S3.Model;
using Overlayer.Worker.Configuration;

namespace Overlayer.Worker.Processing;

public class S3OutputUploader : IOutputUploader
{
    private readonly IAmazonS3 _s3;
    private readonly string _bucket;

    public S3OutputUploader(IAmazonS3 s3, S3Options options)
    {
        _s3 = s3;
        _bucket = options.BucketName;
    }

    public async Task UploadAsync(string localPath, string sessionId, string jobId, CancellationToken ct = default)
    {
        var key = $"outputs/{sessionId}/{jobId}/output.mp4";
        using var stream = File.OpenRead(localPath);
        await _s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = _bucket,
            Key = key,
            InputStream = stream
        }, ct);
    }
}