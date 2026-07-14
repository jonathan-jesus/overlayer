using Amazon.S3;
using Amazon.S3.Model;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Unit.JobProcessor;

public class ValidationHandlingTests
{
    private const string BucketName = "overlayer-bucket";
    private static readonly S3Options s3Options = new S3Options { BucketName = BucketName };
    private const string SessionId = "sessionId";
    private const string JobId = "jobId";
    private static readonly string VideoKey = $"jobs/{SessionId}/{JobId}/video.mp4";
    private static readonly string OverlayKey = $"jobs/{SessionId}/{JobId}/overlay.png";
    private static readonly string OutputKey = $"outputs/{SessionId}/{JobId}/output.mp4";
    private static readonly string ErrorKey = $"outputs/{SessionId}/{JobId}/error.json";

    private readonly IAmazonS3 _s3;
    private readonly IProcessRunner _runner;
    private readonly IFfmpegCommandBuilder _builder;
    private readonly IOutputUploader _uploader;
    private readonly IMediaValidator _validator;
    private readonly IOverlayValidator _overlayValidator;
    private readonly Processing.JobProcessor _processor;

    public ValidationHandlingTests()
    {
        _s3 = Substitute.For<IAmazonS3>();
        _runner = Substitute.For<IProcessRunner>();
        _builder = Substitute.For<IFfmpegCommandBuilder>();
        _uploader = Substitute.For<IOutputUploader>();
        _validator = Substitute.For<IMediaValidator>();
        _overlayValidator = Substitute.For<IOverlayValidator>();
        _overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Valid()));

        _s3.GetObjectMetadataAsync(Arg.Is<GetObjectMetadataRequest>(r => r.Key == OutputKey), Arg.Any<CancellationToken>())
            .ThrowsAsync(new AmazonS3Exception("Not Found") { StatusCode = System.Net.HttpStatusCode.NotFound });

        _s3.GetObjectMetadataAsync(Arg.Is<GetObjectMetadataRequest>(r => r.Key == VideoKey), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new GetObjectMetadataResponse()));

        _s3.GetObjectMetadataAsync(Arg.Is<GetObjectMetadataRequest>(r => r.Key == OverlayKey), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new GetObjectMetadataResponse()));

        _s3.GetObjectAsync(Arg.Any<GetObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new GetObjectResponse { ResponseStream = new MemoryStream() }));

        _overlayValidator = Substitute.For<IOverlayValidator>();
        _overlayValidator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Valid()));
        _processor = new Processing.JobProcessor(_s3, s3Options, _runner, _builder, _uploader, _validator, _overlayValidator);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenVideoExceedsMaxDimensions_WritesValidationTombstone()
    {
        var errorMessage = "Dimensions exceed maximum allowed of 1080p.";
        _validator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Fail(errorMessage)));

        await _processor.HandleAsync(SessionId, JobId);

        await _s3.Received(1).PutObjectAsync(Arg.Is<PutObjectRequest>(req =>
            req.Key == ErrorKey &&
            req.ContentBody.Contains(errorMessage) &&
            req.ContentBody.Contains("\"stage\":\"validation\"")
        ), Arg.Any<CancellationToken>());
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenVideoCodecIsNotH264_WritesValidationTombstone()
    {
        var errorMessage = "Codec must be H264.";
        _validator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Fail(errorMessage)));

        await _processor.HandleAsync(SessionId, JobId);

        await _s3.Received(1).PutObjectAsync(Arg.Is<PutObjectRequest>(req =>
            req.Key == ErrorKey &&
            req.ContentBody.Contains(errorMessage) &&
            req.ContentBody.Contains("\"stage\":\"validation\"")
        ), Arg.Any<CancellationToken>());
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenValidationFails_DoesNotRunFfmpeg()
    {
        _validator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Fail("Any error")));

        await _processor.HandleAsync(SessionId, JobId);

        await _runner.DidNotReceiveWithAnyArgs().RunAsync(default!, default!);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task HandleAsync_WhenValidationFails_DoesNotWriteOutput()
    {
        _validator.ValidateAsync(Arg.Any<string>()).Returns(Task.FromResult(MediaValidationResult.Fail("Any error")));

        await _processor.HandleAsync(SessionId, JobId);

        await _uploader.DidNotReceiveWithAnyArgs().UploadAsync(default!, default!, default!);
    }
}


