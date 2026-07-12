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

        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var processor = new JobProcessor(_fixture.GetS3Client(), s3Options, new FfmpegProcessRunner(), FfmpegCommandBuilder.WithDefaults(), uploader, validator, overlayValidator);

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
        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var processor = new JobProcessor(_fixture.GetS3Client(), s3Options, processRunner, FfmpegCommandBuilder.WithDefaults(), uploader, validator, overlayValidator);

        var exception = await Record.ExceptionAsync(() => processor.HandleAsync(sessionId, jobId));

        Assert.Null(exception);
        await processRunner.DidNotReceiveWithAnyArgs().RunAsync(default!, default!);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task HandleAsync_WhenSiblingIsMissing_DoesNotProcess()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _fixture.CreateBucketAsync(BucketName);

        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/video.mp4", FfmpegFixtures.VideoStream());

        var processRunner = Substitute.For<IProcessRunner>();
        var uploader = new S3OutputUploader(_fixture.GetS3Client(), s3Options);
        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var processor = new JobProcessor(_fixture.GetS3Client(), s3Options, processRunner, FfmpegCommandBuilder.WithDefaults(), uploader, validator, overlayValidator);

        var exception = await Record.ExceptionAsync(() => processor.HandleAsync(sessionId, jobId));

        Assert.Null(exception);
        await processRunner.DidNotReceiveWithAnyArgs().RunAsync(default!, default!);

        var exists = await _fixture.ObjectExistsAsync(BucketName, $"outputs/{sessionId}/{jobId}/output.mp4");
        Assert.False(exists);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task HandleAsync_WhenCalledConcurrently_OnlyProcessesOnce()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _fixture.CreateBucketAsync(BucketName);

        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/video.mp4", FfmpegFixtures.VideoStream());
        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/overlay.png", FfmpegFixtures.OverlayStream());

        var processStartedTcs = new TaskCompletionSource();
        var releaseProcessTcs = new TaskCompletionSource();

        var processRunner = Substitute.For<IProcessRunner>();
        processRunner.RunAsync(default!, default!).ReturnsForAnyArgs(async callInfo =>
        {
            processStartedTcs.TrySetResult(); // Signal that we've reached RunAsync
            await releaseProcessTcs.Task;     // Wait until we are allowed to finish
            return new ProcessResult(0, "");
        });

        var uploader = Substitute.For<IOutputUploader>();

        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var processor1 = new JobProcessor(_fixture.GetS3Client(), s3Options, processRunner, FfmpegCommandBuilder.WithDefaults(), uploader, validator, overlayValidator);
        var processor2 = new JobProcessor(_fixture.GetS3Client(), s3Options, processRunner, FfmpegCommandBuilder.WithDefaults(), uploader, validator, overlayValidator);

        var task1 = processor1.HandleAsync(sessionId, jobId);

        await Task.WhenAny(processStartedTcs.Task, Task.Delay(TimeSpan.FromSeconds(10)));

        var task2 = processor2.HandleAsync(sessionId, jobId);

        releaseProcessTcs.TrySetResult();

        await Task.WhenAll(task1, task2);

        await processRunner.Received(1).RunAsync(Arg.Any<string>(), Arg.Any<string>());
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task HandleAsync_WhenProcessFails_WritesErrorJsonAndNoOutput()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _fixture.CreateBucketAsync(BucketName);

        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/video.mp4", FfmpegFixtures.VideoStream());
        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/overlay.png", FfmpegFixtures.OverlayStream());

        var processRunner = Substitute.For<IProcessRunner>();
        processRunner.RunAsync(default!, default!).ReturnsForAnyArgs(Task.FromResult(new ProcessResult(1, "ffmpeg failed")));

        var uploader = new S3OutputUploader(_fixture.GetS3Client(), s3Options);
        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var processor = new JobProcessor(_fixture.GetS3Client(), s3Options, processRunner, FfmpegCommandBuilder.WithDefaults(), uploader, validator, overlayValidator);

        var exception = await Record.ExceptionAsync(() => processor.HandleAsync(sessionId, jobId));

        Assert.Null(exception);

        var errorKey = $"outputs/{sessionId}/{jobId}/error.json";
        var exists = await _fixture.ObjectExistsAsync(BucketName, errorKey);
        Assert.True(exists);

        var getResponse = await _fixture.GetS3Client().GetObjectAsync(BucketName, errorKey);
        using var reader = new StreamReader(getResponse.ResponseStream);
        var json = await reader.ReadToEndAsync();

        Assert.Contains("\"reason\":", json);
        Assert.Contains("\"stage\":\"process\"", json.Replace(" ", ""));
        Assert.Contains("\"timestamp\":", json);

        var outputExists = await _fixture.ObjectExistsAsync(BucketName, $"outputs/{sessionId}/{jobId}/output.mp4");
        Assert.False(outputExists);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task HandleAsync_WhenVideoValidationFails_WritesValidationTombstone()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _fixture.CreateBucketAsync(BucketName);

        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/video.mp4", FfmpegFixtures.EmptyVideoStream());
        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/overlay.png", FfmpegFixtures.OverlayStream());

        var uploader = new S3OutputUploader(_fixture.GetS3Client(), s3Options);

        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Fail("validation failed"));

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var processRunner = new FfmpegProcessRunner();
        var processor = new JobProcessor(_fixture.GetS3Client(), s3Options, processRunner, FfmpegCommandBuilder.WithDefaults(), uploader, validator, overlayValidator);

        var exception = await Record.ExceptionAsync(() => processor.HandleAsync(sessionId, jobId));

        Assert.Null(exception);

        var errorKey = $"outputs/{sessionId}/{jobId}/error.json";
        var exists = await _fixture.ObjectExistsAsync(BucketName, errorKey);
        Assert.True(exists, "Expected error.json to be written due to validation failure.");

        var getResponse = await _fixture.GetS3Client().GetObjectAsync(BucketName, errorKey);
        using var reader = new StreamReader(getResponse.ResponseStream);
        var json = await reader.ReadToEndAsync();

        Assert.Contains("\"stage\":\"validation\"", json.Replace(" ", ""));

        var outputExists = await _fixture.ObjectExistsAsync(BucketName, $"outputs/{sessionId}/{jobId}/output.mp4");
        Assert.False(outputExists);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task HandleAsync_WhenOverlayValidationFails_WritesValidationTombstone()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _fixture.CreateBucketAsync(BucketName);

        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/video.mp4", FfmpegFixtures.VideoStream());
        await _fixture.UploadObjectAsync(BucketName, $"jobs/{sessionId}/{jobId}/overlay.png", FfmpegFixtures.OverlayStream());

        var uploader = new S3OutputUploader(_fixture.GetS3Client(), s3Options);

        var validator = Substitute.For<IMediaValidator>();
        validator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Valid());

        var overlayValidator = Substitute.For<IOverlayValidator>();
        overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(MediaValidationResult.Fail("overlay validation failed"));

        var processRunner = new FfmpegProcessRunner();
        var processor = new JobProcessor(_fixture.GetS3Client(), s3Options, processRunner, FfmpegCommandBuilder.WithDefaults(), uploader, validator, overlayValidator);

        var exception = await Record.ExceptionAsync(() => processor.HandleAsync(sessionId, jobId));

        Assert.Null(exception);

        var errorKey = $"outputs/{sessionId}/{jobId}/error.json";
        var exists = await _fixture.ObjectExistsAsync(BucketName, errorKey);
        Assert.True(exists, "Expected error.json to be written due to overlay validation failure.");

        var getResponse = await _fixture.GetS3Client().GetObjectAsync(BucketName, errorKey);
        using var reader = new StreamReader(getResponse.ResponseStream);
        var json = await reader.ReadToEndAsync();

        Assert.Contains("\"stage\":\"validation\"", json.Replace(" ", ""));

        var outputExists = await _fixture.ObjectExistsAsync(BucketName, $"outputs/{sessionId}/{jobId}/output.mp4");
        Assert.False(outputExists);
    }
}