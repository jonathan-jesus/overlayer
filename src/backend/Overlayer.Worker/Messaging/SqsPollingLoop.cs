using Amazon.SQS;
using Amazon.SQS.Model;
using Microsoft.Extensions.Logging;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Messaging;

public class SqsPollingLoop
{
    private readonly IAmazonSQS _sqs;
    private readonly SqsOptions _options;
    private readonly IJobProcessor _processor;
    private readonly ILogger<SqsPollingLoop> _logger;
    public SqsPollingLoop(IAmazonSQS sqs, SqsOptions options, IJobProcessor processor, ILogger<SqsPollingLoop> logger)
    {
        _logger = logger;
        _processor = processor;
        _options = options;
        _sqs = sqs;
    }

    public async Task RunOnceAsync(CancellationToken ct = default)
    {
        var sqsOptions = _options;
        var response = await _sqs.ReceiveMessageAsync(new ReceiveMessageRequest
        {
            QueueUrl = sqsOptions.QueueUrl,
            MaxNumberOfMessages = 10,
            WaitTimeSeconds = sqsOptions.WaitTimeSeconds
        }, ct);

        foreach (var message in response.Messages)
        {
            try
            {
                var jobInfo = SqsMessageParser.Parse(message.Body);

                bool shouldDelete = true;
                if (jobInfo != null)
                {
                    shouldDelete = await _processor.HandleAsync(jobInfo.Value.SessionId, jobInfo.Value.JobId);
                }

                if (shouldDelete)
                {
                    await _sqs.DeleteMessageAsync(sqsOptions.QueueUrl, message.ReceiptHandle, ct);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Failed to process message {MessageId}.",
                    message.MessageId);
            }
        }
    }
}
