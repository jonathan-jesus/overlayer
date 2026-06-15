using System.Runtime.InteropServices;
using Overlayer.Worker.Ffmpeg;

namespace Overlayer.Worker.Tests.Unit.Ffmpeg;

public class FfmpegProcessRunnerTests
{
    private readonly FfmpegProcessRunner _runner;
    public FfmpegProcessRunnerTests()
    {
        _runner = new FfmpegProcessRunner();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task RunAsync_CapturesStandardOutput()
    {
        var isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
        var command = isWindows ? "cmd.exe" : "sh";
        var args = isWindows ? "/c echo test_stdout" : "-c \"echo test_stdout\"";
        var result = await _runner.RunAsync(command, args);

        Assert.NotNull(result.StandardOutput);
        Assert.Contains("test_stdout", result.StandardOutput);
    }
}
