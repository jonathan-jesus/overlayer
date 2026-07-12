using Amazon.S3;
using Amazon.S3.Model;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Unit.JobProcessor;

public class LockAcquisitionTests
{
    private const string BucketName = "overlayer-bucket";
    private static readonly S3Options s3Options = new S3Options { BucketName = BucketName };
    private const string SessionId = "sessionId";
    private const string JobId = "jobId";

    private static readonly string OutputKey = $"outputs/{SessionId}/{JobId}/output.mp4";
    private static readonly string VideoKey = $"jobs/{SessionId}/{JobId}/video.mp4";
    private static readonly string OverlayKey = $"jobs/{SessionId}/{JobId}/overlay.png";
    private static readonly string LockKey = $"locks/{SessionId}/{JobId}.lock";

    // Only the lock PUT behaviour differs between the two builders below.
    private static IAmazonS3 BuildS3WithGatesOpen()
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

        return s3;
    }

    // Lock PUT → 200 OK
    private static IAmazonS3 BuildS3WhereLockSucceeds()
    {
        var s3 = BuildS3WithGatesOpen();

        s3.PutObjectAsync(
                Arg.Is<PutObjectRequest>(r =>
                    r.BucketName == BucketName && r.Key == LockKey),
                Arg.Any<CancellationToken>())
          .Returns(new PutObjectResponse
          {
              HttpStatusCode = System.Net.HttpStatusCode.OK
          });

        s3.GetObjectAsync(
                Arg.Any<GetObjectRequest>(),
                Arg.Any<CancellationToken>())
          .ThrowsAsync(new InvalidOperationException("render-step-reached"));

        return s3;
    }

    // Lock PUT → 412 Precondition Failed
    private static IAmazonS3 BuildS3WhereLockIsHeld()
    {
        var s3 = BuildS3WithGatesOpen();

        s3.PutObjectAsync(
                Arg.Is<PutObjectRequest>(r =>
                    r.BucketName == BucketName && r.Key == LockKey),
                Arg.Any<CancellationToken>())
          .ThrowsAsync(new AmazonS3Exception("Precondition Failed")
          {
              StatusCode = System.Net.HttpStatusCode.PreconditionFailed
          });

        s3.GetObjectAsync(
                Arg.Any<GetObjectRequest>(),
                Arg.Any<CancellationToken>())
          .ThrowsAsync(new InvalidOperationException(
              "GetObjectAsync should never be called when the lock is already held"));

        return s3;
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenLockIsAcquired_ProceedsToRenderStep()
    {
        var s3 = BuildS3WhereLockSucceeds();
        var runner = Substitute.For<IProcessRunner>();
        var builder = Substitute.For<IFfmpegCommandBuilder>();
        var uploader = Substitute.For<IOutputUploader>();
        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Valid()));
        var processor = new Processing.JobProcessor(s3, s3Options, runner, builder, uploader, validator, overlayValidator);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => processor.HandleAsync(SessionId, JobId));

        Assert.Equal("render-step-reached", ex.Message);

        await s3.Received(1).PutObjectAsync(
            Arg.Is<PutObjectRequest>(r =>
                r.BucketName == BucketName && r.Key == LockKey),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenLockIsAlreadyHeld_ExitsCleanlyWithoutRendering()
    {
        var s3 = BuildS3WhereLockIsHeld();
        var runner = Substitute.For<IProcessRunner>();
        var builder = Substitute.For<IFfmpegCommandBuilder>();
        var uploader = Substitute.For<IOutputUploader>();
        var validator = Substitute.For<IMediaValidator>();

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Valid()));
        var processor = new Processing.JobProcessor(s3, s3Options, runner, builder, uploader, validator, overlayValidator);

        var result = await processor.HandleAsync(SessionId, JobId);

        Assert.False(result);
        await s3.DidNotReceive().GetObjectAsync(
            Arg.Any<GetObjectRequest>(),
            Arg.Any<CancellationToken>());

        await s3.DidNotReceive().PutObjectAsync(
            Arg.Is<PutObjectRequest>(r => r.Key == OutputKey),
            Arg.Any<CancellationToken>());
    }
}


