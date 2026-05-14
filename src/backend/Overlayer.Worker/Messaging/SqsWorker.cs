using Microsoft.Extensions.Hosting;

namespace Overlayer.Worker.Messaging;

public class SqsWorker : BackgroundService
{
    private readonly SqsPollingLoop _loop;

    public SqsWorker(SqsPollingLoop loop)
    {
        _loop = loop;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await _loop.RunOnceAsync(stoppingToken);
        }
    }
}