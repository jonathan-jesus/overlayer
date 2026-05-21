namespace Overlayer.Worker.Ffmpeg;

public record ProcessResult(int ExitCode, string StandardError, string StandardOutput = "");

public interface IProcessRunner
{
    Task<ProcessResult> RunAsync(string fileName, string arguments);
}
