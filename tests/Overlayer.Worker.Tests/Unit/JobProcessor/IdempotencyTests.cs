using Amazon.S3;
using Amazon.S3.Model;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Unit.JobProcessor;

public class IdempotencyTests
{
    private const string BucketName = "overlayer-bucket";
    private static readonly S3Options s3Options = new S3Options { BucketName = BucketName };
    private const string SessionId = "sessionId";
    private const string JobId = "jobId";

    private static readonly string OutputKey = $"outputs/{SessionId}/{JobId}/output.mp4";
    private static readonly string VideoKey = $"jobs/{SessionId}/{JobId}/video.mp4";
    private static readonly string OverlayKey = $"jobs/{SessionId}/{JobId}/overlay.png";

    // Creates an S3 mock where the specified key exists and all others return 404
    private static IAmazonS3 BuildS3WhereOutputExists(string existingKey)
    {
        var s3 = Substitute.For<IAmazonS3>();

        s3.GetObjectMetadataAsync(
                Arg.Is<GetObjectMetadataRequest>(r =>
                    r.BucketName == BucketName && r.Key == existingKey),
                Arg.Any<CancellationToken>())
          .Returns(new GetObjectMetadataResponse());

        s3.GetObjectMetadataAsync(
                Arg.Is<GetObjectMetadataRequest>(r =>
                    r.BucketName == BucketName && r.Key != existingKey),
                Arg.Any<CancellationToken>())
          .ThrowsAsync(new AmazonS3Exception("Not Found")
          {
              StatusCode = System.Net.HttpStatusCode.NotFound
          });

        // Guard should return before attempting to fetch any objects.
        s3.GetObjectAsync(
                Arg.Any<GetObjectRequest>(),
                Arg.Any<CancellationToken>())
          .ThrowsAsync(new InvalidOperationException("GetObjectAsync should never be called when output already exists"));

        return s3;
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenOutputAlreadyExists_ReturnsEarlyWithoutProcessing()
    {
        var s3 = BuildS3WhereOutputExists(OutputKey);
        var uploader = Substitute.For<IOutputUploader>();
        var runner = Substitute.For<IProcessRunner>();
        var builder = Substitute.For<IFfmpegCommandBuilder>();
        var validator = Substitute.For<IMediaValidator>();

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Valid()));
        var processor = new Processing.JobProcessor(s3, s3Options, runner, builder, uploader, validator, overlayValidator);

        var result = await processor.HandleAsync(SessionId, JobId);

        Assert.True(result);
        await s3.DidNotReceive().GetObjectMetadataAsync(
            Arg.Is<GetObjectMetadataRequest>(r => r.Key == VideoKey),
            Arg.Any<CancellationToken>());

        await s3.DidNotReceive().GetObjectMetadataAsync(
            Arg.Is<GetObjectMetadataRequest>(r => r.Key == OverlayKey),
            Arg.Any<CancellationToken>());

        await s3.DidNotReceive().GetObjectAsync(
            Arg.Any<GetObjectRequest>(),
            Arg.Any<CancellationToken>());
    }
}

