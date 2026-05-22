namespace Overlayer.Worker.Processing;

public interface IJobProcessor
{
    Task<bool> HandleAsync(string sessionId, string jobId);
}
