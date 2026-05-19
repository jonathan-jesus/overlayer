using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;

namespace Overlayer.Worker.Tests.Unit.Ffmpeg;

public class FfmpegCommandBuilderTests
{
    private const string VideoPath = "video.mp4";
    private const string OverlayPath = "overlay.png";
    private const string OutputPath = "output.mp4";

    [Fact]
    [Trait("Category", "Unit")]
    public void Build_ContainsRequiredPaths()
    {
        var args = FfmpegCommandBuilder.WithDefaults().Build(VideoPath, OverlayPath, OutputPath);

        Assert.Contains($"-i \"{VideoPath}\"", args);
        Assert.Contains($"-i \"{OverlayPath}\"", args);
        Assert.Contains(OutputPath, args);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Build_AppliesOverlayFilter()
    {
        var args = FfmpegCommandBuilder.WithDefaults().Build(VideoPath, OverlayPath, OutputPath);

        Assert.Contains("-filter_complex \"[0:v][1:v]overlay=0:0\"", args);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Build_UsesProjectStandardCodecAndQuality()
    {
        var args = FfmpegCommandBuilder.WithDefaults().Build(VideoPath, OverlayPath, OutputPath);

        Assert.Contains("-c:v libx264", args);
        Assert.Contains("-crf 20", args);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Build_PreservesAudio()
    {
        var args = FfmpegCommandBuilder.WithDefaults().Build(VideoPath, OverlayPath, OutputPath);

        Assert.Contains("-c:a copy", args);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Build_RespectsConfiguredBitrateLimits()
    {
        var ffmpegOptions = new FfmpegOptions
        {
            MinBitrate = 10000,
            MaxBitrate = 4000
        };

        var args = new FfmpegCommandBuilder(ffmpegOptions).Build(VideoPath, OverlayPath, OutputPath);

        Assert.Contains($"-minrate {ffmpegOptions.MinBitrate}k", args);
        Assert.Contains($"-maxrate {ffmpegOptions.MaxBitrate}k", args);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Build_BuffersizeDoubleMaxBitrate()
    {
        var ffmpegOptions = new FfmpegOptions
        {
            MinBitrate = 10000,
            MaxBitrate = 4000
        };

        var args = new FfmpegCommandBuilder(ffmpegOptions).Build(VideoPath, OverlayPath, OutputPath);

        Assert.Contains($"-bufsize {ffmpegOptions.MaxBitrate * 2}k", args);
    }
}
