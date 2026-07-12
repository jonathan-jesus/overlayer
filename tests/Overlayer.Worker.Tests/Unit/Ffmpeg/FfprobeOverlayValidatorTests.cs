using System.Text.Json;
using NSubstitute;
using Overlayer.Worker.Ffmpeg;

namespace Overlayer.Worker.Tests.Unit.Ffmpeg;

public class FfprobeOverlayValidatorTests
{
    private readonly IProcessRunner _processRunner;
    private readonly FfprobeOverlayValidator _validator;

    public FfprobeOverlayValidatorTests()
    {
        _processRunner = Substitute.For<IProcessRunner>();
        _validator = new FfprobeOverlayValidator(_processRunner);
    }

    private void SetupFfprobeResult(int exitCode, string stdout = "") =>
        _processRunner
            .RunAsync("ffprobe", Arg.Any<string>())
            .Returns(new ProcessResult(exitCode, StandardError: "", StandardOutput: stdout));

    private static string BuildFfprobeJson(string codec = "png") =>
        JsonSerializer.Serialize(new
        {
            streams = new[]
            {
                new { codec_name = codec }
            }
        });

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_WhenFfprobeExitsWithNonZero_ReturnsFail()
    {
        SetupFfprobeResult(exitCode: 1);

        var result = await _validator.ValidateAsync("overlay.png");

        Assert.False(result.IsValid);
        Assert.Contains("The overlay file provided is invalid", result.FailureReason);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_PassesCorrectArgumentsToFfprobe()
    {
        const string overlayPath = "overlay.png";
        SetupFfprobeResult(exitCode: 0, stdout: BuildFfprobeJson());

        await _validator.ValidateAsync(overlayPath);

        await _processRunner.Received(1).RunAsync(
            "ffprobe",
            Arg.Is<string>(args => args.Contains(overlayPath)));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_WhenFfprobeOutputIsInvalidJson_ReturnsFail()
    {
        SetupFfprobeResult(exitCode: 0, stdout: "invalid json");

        var result = await _validator.ValidateAsync("overlay.png");

        Assert.False(result.IsValid);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_WhenStreamsArrayIsEmpty_ReturnsFail()
    {
        var json = JsonSerializer.Serialize(new { streams = Array.Empty<object>() });
        SetupFfprobeResult(exitCode: 0, stdout: json);

        var result = await _validator.ValidateAsync("overlay.png");

        Assert.False(result.IsValid);
        Assert.Contains("No image stream found", result.FailureReason);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task ValidateAsync_WhenCodecIsPng_ReturnsValid()
    {
        SetupFfprobeResult(exitCode: 0, stdout: BuildFfprobeJson(codec: "png"));

        var result = await _validator.ValidateAsync("overlay.png");

        Assert.True(result.IsValid);
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("jpeg")]
    [InlineData("gif")]
    [InlineData("h264")]
    public async Task ValidateAsync_WhenCodecIsNotPng_ReturnsFail(string codec)
    {
        SetupFfprobeResult(exitCode: 0, stdout: BuildFfprobeJson(codec: codec));

        var result = await _validator.ValidateAsync("overlay.png");

        Assert.False(result.IsValid);
        Assert.Contains(codec, result.FailureReason);
    }
}
