using Amazon.SQS;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Messaging;

public class SqsPollingLoop
{
    public SqsPollingLoop(IAmazonSQS sqs, SqsOptions options, IJobProcessor processor) { }

    public async Task RunOnceAsync(CancellationToken ct = default)
        => throw new NotImplementedException();
}
