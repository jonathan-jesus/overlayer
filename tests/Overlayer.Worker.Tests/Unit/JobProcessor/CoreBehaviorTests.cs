using Amazon.S3;
using Amazon.S3.Model;
using NSubstitute;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Unit.JobProcessor;

public class CoreBehaviorTests
{
    private const string BucketName = "overlayer-bucket";
    private static S3Options s3Options = new S3Options { BucketName = BucketName };
    private const string SessionId = "sessionId";
    private const string JobId = "jobId";

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_ShouldPassArgumentsFromBuilderToProcessRunner()
    {
        var s3 = Substitute.For<IAmazonS3>();

        s3.GetObjectAsync(Arg.Any<GetObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                var ms = new MemoryStream();
                return Task.FromResult(new GetObjectResponse { ResponseStream = ms });
            });

        var uploader = Substitute.For<IOutputUploader>();

        uploader.UploadAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>())
                .Returns(Task.CompletedTask);

        var runner = Substitute.For<IProcessRunner>();
        runner.RunAsync(Arg.Any<string>(), Arg.Any<string>()).Returns(new ProcessResult(0, ""));

        var builder = Substitute.For<IFfmpegCommandBuilder>();
        builder.Build(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>()).Returns("mock_ffmpeg_args");

        var processor = new Processing.JobProcessor(s3, s3Options, runner, builder, uploader);

        await processor.HandleAsync(SessionId, JobId);

        await runner.Received(1).RunAsync("ffmpeg", "mock_ffmpeg_args");
    }
}
