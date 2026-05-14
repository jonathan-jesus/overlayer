namespace Overlayer.Worker.Processing;

public interface IJobProcessor
{
    Task HandleAsync(string sessionId, string jobId);
}
