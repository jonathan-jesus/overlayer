using Amazon.S3;
using Amazon.S3.Model;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;
using Overlayer.Worker.Processing;
using System.Text.Json;

namespace Overlayer.Worker.Tests.Unit.JobProcessor;

public class FailureHandlingTests
{
    private const string BucketName = "overlayer-bucket";
    private static readonly S3Options s3Options = new S3Options { BucketName = BucketName };
    private const string SessionId = "sessionId";
    private const string JobId = "jobId";

    private static readonly string OutputKey = $"outputs/{SessionId}/{JobId}/output.mp4";
    private static readonly string ErrorKey = $"outputs/{SessionId}/{JobId}/error.json";
    private static readonly string VideoKey = $"jobs/{SessionId}/{JobId}/video.mp4";
    private static readonly string OverlayKey = $"jobs/{SessionId}/{JobId}/overlay.png";
    private static readonly string LockKey = $"locks/{SessionId}/{JobId}.lock";

    // Builds an S3 mock with all pipeline gates open
    private static IAmazonS3 BuildS3WithAllGatesOpen()
    {
        var s3 = Substitute.For<IAmazonS3>();

        s3.GetObjectMetadataAsync(
                Arg.Is<GetObjectMetadataRequest>(r =>
                    r.BucketName == BucketName && r.Key == OutputKey),
                Arg.Any<CancellationToken>())
          .ThrowsAsync(new AmazonS3Exception("Not Found")
          {
              StatusCode = System.Net.HttpStatusCode.NotFound
          });

        s3.GetObjectMetadataAsync(
                Arg.Is<GetObjectMetadataRequest>(r =>
                    r.BucketName == BucketName && r.Key == VideoKey),
                Arg.Any<CancellationToken>())
          .Returns(new GetObjectMetadataResponse());

        s3.GetObjectMetadataAsync(
                Arg.Is<GetObjectMetadataRequest>(r =>
                    r.BucketName == BucketName && r.Key == OverlayKey),
                Arg.Any<CancellationToken>())
          .Returns(new GetObjectMetadataResponse());

        s3.PutObjectAsync(
                Arg.Is<PutObjectRequest>(r =>
                    r.BucketName == BucketName && r.Key == LockKey),
                Arg.Any<CancellationToken>())
          .Returns(new PutObjectResponse
          {
              HttpStatusCode = System.Net.HttpStatusCode.OK
          });

        // GetObjectAsync returns a dummy empty stream so the download can succeed
        s3.GetObjectAsync(
                Arg.Any<GetObjectRequest>(),
                Arg.Any<CancellationToken>())
          .Returns(_ => Task.FromResult(
              new GetObjectResponse { ResponseStream = new MemoryStream() }));

        return s3;
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenFfmpegExitsWithNonZeroCode_WritesErrorJsonTombstone()
    {
        var s3 = BuildS3WithAllGatesOpen();

        var runner = Substitute.For<IProcessRunner>();
        runner
            .RunAsync(Arg.Any<string>(), Arg.Any<string>())
            .Returns(new ProcessResult(1, "Processing failed"));

        var builder = Substitute.For<IFfmpegCommandBuilder>();
        builder
            .Build(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>())
            .Returns("mock_ffmpeg_args");

        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Valid()));
        var processor = new Processing.JobProcessor(s3, s3Options, runner, builder, Substitute.For<IOutputUploader>(), validator, overlayValidator);

        await processor.HandleAsync(SessionId, JobId);

        var writtenCalls = s3.ReceivedCalls()
            .Where(c =>
                c.GetMethodInfo().Name == nameof(IAmazonS3.PutObjectAsync)
                && c.GetArguments()[0] is PutObjectRequest req
                && req.Key == ErrorKey)
            .ToList();

        Assert.Single(writtenCalls);

        var putRequest = (PutObjectRequest)writtenCalls[0].GetArguments()[0]!;
        Assert.NotNull(putRequest.ContentBody);

        using var doc = JsonDocument.Parse(putRequest.ContentBody);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("reason", out var reasonProp),
            "error.json must contain a 'reason' field");
        Assert.Equal(JsonValueKind.String, reasonProp.ValueKind);
        Assert.False(string.IsNullOrWhiteSpace(reasonProp.GetString()),
            "'reason' must not be empty");

        Assert.True(root.TryGetProperty("stage", out var stageProp),
            "error.json must contain a 'stage' field");
        Assert.Equal("process", stageProp.GetString());

        Assert.True(root.TryGetProperty("timestamp", out var timestampProp),
            "error.json must contain a 'timestamp' field");
        Assert.True(
            DateTimeOffset.TryParse(
                timestampProp.GetString(),
                null,
                System.Globalization.DateTimeStyles.RoundtripKind,
                out var parsed),
            "'timestamp' must be a valid ISO 8601 string");
        Assert.Equal(TimeSpan.Zero, parsed.Offset);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenFfmpegExitsWithNonZeroCode_DoesNotWriteOutput()
    {
        var s3 = BuildS3WithAllGatesOpen();

        var runner = Substitute.For<IProcessRunner>();
        runner
            .RunAsync(Arg.Any<string>(), Arg.Any<string>())
            .Returns(new ProcessResult(1, "Processing failed"));

        var builder = Substitute.For<IFfmpegCommandBuilder>();
        builder
            .Build(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>())
            .Returns("mock_ffmpeg_args");

        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Valid()));
        var processor = new Processing.JobProcessor(s3, s3Options, runner, builder, Substitute.For<IOutputUploader>(), validator, overlayValidator);

        await processor.HandleAsync(SessionId, JobId);

        await s3.DidNotReceive().PutObjectAsync(
            Arg.Is<PutObjectRequest>(r =>
                r.BucketName == BucketName && r.Key == OutputKey),
            Arg.Any<CancellationToken>());
    }
}


