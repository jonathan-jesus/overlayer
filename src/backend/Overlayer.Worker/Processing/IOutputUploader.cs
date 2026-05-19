namespace Overlayer.Worker.Processing;

public interface IOutputUploader
{
    Task UploadAsync(string localPath, string sessionId, string jobId, CancellationToken ct = default);
}