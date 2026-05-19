using NSubstitute;
using Overlayer.TestSupport.Infrastructure;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Integration;

[Collection("WorkerLocalStack")]
public class JobProcessorTests
{
    private const string BucketName = "overlayer-worker-test";
    private static readonly S3Options s3Options = new S3Options { BucketName = BucketName };
    private readonly LocalStackFixture _fixture;

    public JobProcessorTests(LocalStackFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task HandleAsync_WithValidInputs_WritesOutputMp4ToS3()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _fixture.CreateBucketAsync(BucketName);

        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/video.mp4", FfmpegFixtures.VideoStream());
        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/overlay.png", FfmpegFixtures.OverlayStream());

        var uploader = new S3OutputUploader(_fixture.GetS3Client(), s3Options);

        var processor = new JobProcessor(_fixture.GetS3Client(), s3Options, new FfmpegProcessRunner(), FfmpegCommandBuilder.WithDefaults(), uploader);

        await processor.HandleAsync(sessionId, jobId);

        var exists = await _fixture.ObjectExistsAsync(BucketName, $"outputs/{sessionId}/{jobId}/output.mp4");
        Assert.True(exists);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task HandleAsync_WhenOutputExists_DoesNotProcessAgain()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _fixture.CreateBucketAsync(BucketName);

        var outputKey = $"outputs/{sessionId}/{jobId}/output.mp4";
        await _fixture.UploadObjectAsync(BucketName, outputKey, new MemoryStream("mock output"u8.ToArray()));

        var processRunner = Substitute.For<IProcessRunner>();
        var uploader = new S3OutputUploader(_fixture.GetS3Client(), s3Options);
        var processor = new JobProcessor(_fixture.GetS3Client(), s3Options, processRunner, FfmpegCommandBuilder.WithDefaults(), uploader);

        var exception = await Record.ExceptionAsync(() => processor.HandleAsync(sessionId, jobId));

        Assert.Null(exception);
        await processRunner.DidNotReceiveWithAnyArgs().RunAsync(default!, default!);
    }
}