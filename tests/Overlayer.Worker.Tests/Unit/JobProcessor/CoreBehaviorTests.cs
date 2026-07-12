using Amazon.S3;
using Amazon.S3.Model;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Unit.JobProcessor;

public class CoreBehaviorTests
{
    private const string BucketName = "overlayer-bucket";
    private static readonly S3Options s3Options = new S3Options { BucketName = BucketName };
    private const string SessionId = "sessionId";
    private const string JobId = "jobId";
    private static readonly string OutputKey = $"outputs/{SessionId}/{JobId}/output.mp4";

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_ShouldPassArgumentsFromBuilderToProcessRunner()
    {
        var s3 = Substitute.For<IAmazonS3>();

        s3.GetObjectMetadataAsync(Arg.Is<GetObjectMetadataRequest>(r => r.Key == OutputKey), Arg.Any<CancellationToken>())
            .ThrowsAsync(new AmazonS3Exception("Not Found") { StatusCode = System.Net.HttpStatusCode.NotFound });

        s3.GetObjectAsync(Arg.Any<GetObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                var ms = new MemoryStream();
                return Task.FromResult(new GetObjectResponse { ResponseStream = ms });
            });

        var uploader = Substitute.For<IOutputUploader>();

        uploader.UploadAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>())
                .Returns(Task.CompletedTask);

        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var runner = Substitute.For<IProcessRunner>();
        runner.RunAsync(Arg.Any<string>(), Arg.Any<string>()).Returns(new ProcessResult(0, ""));

        var builder = Substitute.For<IFfmpegCommandBuilder>();
        builder.Build(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>()).Returns("mock_ffmpeg_args");

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Valid()));
        var processor = new Processing.JobProcessor(s3, s3Options, runner, builder, uploader, validator, overlayValidator);

        await processor.HandleAsync(SessionId, JobId);

        await runner.Received(1).RunAsync("ffmpeg", "mock_ffmpeg_args");
    }
}


