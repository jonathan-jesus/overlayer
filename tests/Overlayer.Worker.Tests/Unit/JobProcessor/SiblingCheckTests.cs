using Amazon.S3;
using Amazon.S3.Model;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Unit.JobProcessor;

public class SiblingCheckTests
{
    private const string BucketName = "overlayer-bucket";
    private static readonly S3Options s3Options = new S3Options { BucketName = BucketName };
    private const string SessionId = "session-abc";
    private const string JobId = "job-xyz";

    private static readonly string OutputKey = $"outputs/{SessionId}/{JobId}/output.mp4";
    private static readonly string VideoKey = $"jobs/{SessionId}/{JobId}/video.mp4";
    private static readonly string OverlayKey = $"jobs/{SessionId}/{JobId}/overlay.png";
    private static readonly string LockKey = $"locks/{SessionId}/{JobId}.lock";

    // Builds an S3 substitute where only one input file exists 
    private static IAmazonS3 BuildS3WhereInputIsMissing(string presentKey, string absentKey)
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
                    r.BucketName == BucketName && r.Key == presentKey),
                Arg.Any<CancellationToken>())
          .Returns(new GetObjectMetadataResponse());

        s3.GetObjectMetadataAsync(
                Arg.Is<GetObjectMetadataRequest>(r =>
                    r.BucketName == BucketName && r.Key == absentKey),
                Arg.Any<CancellationToken>())
          .ThrowsAsync(new AmazonS3Exception("Not Found")
          {
              StatusCode = System.Net.HttpStatusCode.NotFound
          });

        s3.GetObjectAsync(
                Arg.Any<GetObjectRequest>(),
                Arg.Any<CancellationToken>())
          .ThrowsAsync(new InvalidOperationException(
              "GetObjectAsync should never be called when a sibling file is missing"));

        s3.PutObjectAsync(
                Arg.Any<PutObjectRequest>(),
                Arg.Any<CancellationToken>())
          .ThrowsAsync(new InvalidOperationException(
              "PutObjectAsync should never be called when a sibling file is missing"));

        return s3;
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenVideoIsMissing_AbortsWithoutAttemptingLock()
    {
        var s3 = BuildS3WhereInputIsMissing(presentKey: OverlayKey, absentKey: VideoKey);
        var runner = Substitute.For<IProcessRunner>();
        var builder = Substitute.For<IFfmpegCommandBuilder>();
        var uploader = Substitute.For<IOutputUploader>();

        var processor = new Processing.JobProcessor(s3, s3Options, runner, builder, uploader);

        await processor.HandleAsync(SessionId, JobId);

        await s3.DidNotReceive().GetObjectAsync(
            Arg.Any<GetObjectRequest>(),
            Arg.Any<CancellationToken>());

        await s3.DidNotReceive().PutObjectAsync(
            Arg.Is<PutObjectRequest>(r => r.Key == LockKey),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenOverlayIsMissing_AbortsWithoutAttemptingLock()
    {
        var s3 = BuildS3WhereInputIsMissing(presentKey: VideoKey, absentKey: OverlayKey);
        var runner = Substitute.For<IProcessRunner>();
        var builder = Substitute.For<IFfmpegCommandBuilder>();
        var uploader = Substitute.For<IOutputUploader>();
        var processor = new Processing.JobProcessor(s3, s3Options, runner, builder, uploader);

        await processor.HandleAsync(SessionId, JobId);

        await s3.DidNotReceive().GetObjectAsync(
            Arg.Any<GetObjectRequest>(),
            Arg.Any<CancellationToken>());

        await s3.DidNotReceive().PutObjectAsync(
            Arg.Is<PutObjectRequest>(r => r.Key == LockKey),
            Arg.Any<CancellationToken>());
    }
}