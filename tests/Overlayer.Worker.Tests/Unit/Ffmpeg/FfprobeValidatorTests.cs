using System.Text.Json;
using NSubstitute;
using Overlayer.Worker.Ffmpeg;

namespace Overlayer.Worker.Tests.Unit.Ffmpeg;

public class FfprobeValidatorTests
{
    private readonly IProcessRunner _processRunner;
    private readonly FfprobeValidator _validator;

    public FfprobeValidatorTests()
    {
        _processRunner = Substitute.For<IProcessRunner>();
        _validator = new FfprobeValidator(_processRunner);
    }

    private void SetupFfprobeResult(int exitCode, string stdout = "") =>
        _processRunner
            .RunAsync("ffprobe", Arg.Any<string>())
            .Returns(new ProcessResult(exitCode, StandardError: "", StandardOutput: stdout));

    private static string BuildFfprobeJson(
        string codec = "h264",
        int width = 1920,
        int height = 1080) =>
        JsonSerializer.Serialize(new
        {
            streams = new[]
            {
                new { codec_name = codec, width, height }
            }
        });

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_WhenFfprobeExitsWithNonZero_ReturnsFail()
    {
        SetupFfprobeResult(exitCode: 1);

        var result = await _validator.ValidateAsync("video.mp4");

        Assert.False(result.IsValid);
        Assert.Contains("exit code 1", result.FailureReason);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_PassesCorrectArgumentsToFfprobe()
    {
        const string videoPath = "video.mp4";
        SetupFfprobeResult(exitCode: 0, stdout: BuildFfprobeJson());

        await _validator.ValidateAsync(videoPath);

        await _processRunner.Received(1).RunAsync(
            "ffprobe",
            Arg.Is<string>(args => args.Contains(videoPath)));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_WhenFfprobeOutputIsInvalidJson_ReturnsFail()
    {
        SetupFfprobeResult(exitCode: 0, stdout: "invalid json");

        var result = await _validator.ValidateAsync("video.mp4");

        Assert.False(result.IsValid);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_WhenStreamsArrayIsEmpty_ReturnsFail()
    {
        var json = JsonSerializer.Serialize(new { streams = Array.Empty<object>() });
        SetupFfprobeResult(exitCode: 0, stdout: json);

        var result = await _validator.ValidateAsync("video.mp4");

        Assert.False(result.IsValid);
        Assert.Contains("No video stream found", result.FailureReason);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_WhenCodecIsH264_ReturnsValid()
    {
        SetupFfprobeResult(exitCode: 0, stdout: BuildFfprobeJson(codec: "h264"));

        var result = await _validator.ValidateAsync("video.mp4");

        Assert.True(result.IsValid);
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("hevc")]
    [InlineData("vp9")]
    [InlineData("av1")]
    public async Task ValidateAsync_WhenCodecIsNotH264_ReturnsFail(string codec)
    {
        SetupFfprobeResult(exitCode: 0, stdout: BuildFfprobeJson(codec: codec));

        var result = await _validator.ValidateAsync("video.mp4");

        Assert.False(result.IsValid);
        Assert.Contains(codec, result.FailureReason);
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData(1920, 1080)]
    [InlineData(1080, 1920)]
    [InlineData(1280, 720)]
    [InlineData(720, 1280)]
    public async Task ValidateAsync_WhenDimensionsAreWithinLimit_ReturnsValid(int width, int height)
    {
        SetupFfprobeResult(exitCode: 0, stdout: BuildFfprobeJson(width: width, height: height));

        var result = await _validator.ValidateAsync("video.mp4");

        Assert.True(result.IsValid);
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData(1921, 1080)]
    [InlineData(1080, 1921)]
    [InlineData(1920, 1081)]
    [InlineData(1081, 1920)]
    [InlineData(3840, 2160)]
    public async Task ValidateAsync_WhenDimensionsExceedLimit_ReturnsFail(int width, int height)
    {
        SetupFfprobeResult(exitCode: 0, stdout: BuildFfprobeJson(width: width, height: height));

        var result = await _validator.ValidateAsync("video.mp4");

        Assert.False(result.IsValid);
        Assert.Contains($"{width}×{height}", result.FailureReason);
    }
}
