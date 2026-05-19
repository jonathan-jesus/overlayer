namespace Overlayer.Worker.Ffmpeg;

public record ProcessResult(int ExitCode, string StandardError);

public interface IProcessRunner
{
    Task<ProcessResult> RunAsync(string fileName, string arguments);
}
