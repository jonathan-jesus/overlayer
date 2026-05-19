using Amazon.S3;
using Overlayer.Worker.Configuration;

namespace Overlayer.Worker.Processing;

public class JobProcessor : IJobProcessor
{
    public JobProcessor(IAmazonS3 s3, S3Options options) { }
    public Task HandleAsync(string sessionId, string jobId)
        => throw new NotImplementedException();
}