namespace Overlayer.Worker.Processing
{
    public class JobProcessor : IJobProcessor
    {
        public Task HandleAsync(string sessionId, string jobId)
            => throw new NotImplementedException();
    }
}