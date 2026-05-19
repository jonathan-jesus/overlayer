using System.Diagnostics;

namespace Overlayer.Worker.Ffmpeg;

public class FfmpegProcessRunner : IProcessRunner
{
    public async Task<ProcessResult> RunAsync(string fileName, string arguments)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();

        // Read stderr concurrently. FFmpeg writes heavily to stderr and will deadlock if the buffer fills
        var stderrTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        var stderr = await stderrTask;

        return new ProcessResult(process.ExitCode, stderr);
    }
}
