using Amazon.SQS;
using Amazon.SQS.Model;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Messaging;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Unit;

public class SqsPollingLoopTests
{
    private const string QueueUrl = "https://sqs.us-east-2.amazonaws.com/000000000000/test-queue";

    private static Message BuildMessage(string sessionId, string jobId, string receiptHandle) =>
        new()
        {
            MessageId = Guid.NewGuid().ToString(),
            ReceiptHandle = receiptHandle,
            Body = $$"""
                {
                  "Records": [{
                    "s3": {
                      "object": { "key": "jobs/{{sessionId}}/{{jobId}}/video.mp4" }
                    }
                  }]
                }
                """
        };

    private static SqsPollingLoop BuildLoop(IAmazonSQS sqs, IJobProcessor processor) =>
        new(sqs, new SqsOptions { QueueUrl = QueueUrl, WaitTimeSeconds = 0 }, processor, NullLogger<SqsPollingLoop>.Instance);

    [Fact]
    [Trait("Category", "Unit")]
    public async Task RunOnceAsync_WhenOneMessageThrows_ProcessingContinuesForRemainingMessages()
    {
        var sqs = Substitute.For<IAmazonSQS>();
        var processor = Substitute.For<IJobProcessor>();

        sqs.ReceiveMessageAsync(Arg.Any<ReceiveMessageRequest>(), Arg.Any<CancellationToken>())
            .Returns(new ReceiveMessageResponse
            {
                Messages =
                [
                    BuildMessage("session-1", "job-1", "receipt-1"),
                    BuildMessage("session-2", "job-2", "receipt-2")
                ]
            });

        processor.HandleAsync("session-1", "job-1")
            .ThrowsAsync(new InvalidOperationException("simulated failure"));

        processor.HandleAsync("session-2", "job-2").Returns(true);

        var loop = BuildLoop(sqs, processor);

        await loop.RunOnceAsync();

        await processor.Received(1).HandleAsync("session-2", "job-2");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task RunOnceAsync_WhenOneMessageThrows_FailedMessageIsNotDeleted_AndSuccessfulMessageIsDeleted()
    {
        var sqs = Substitute.For<IAmazonSQS>();
        var processor = Substitute.For<IJobProcessor>();

        sqs.ReceiveMessageAsync(Arg.Any<ReceiveMessageRequest>(), Arg.Any<CancellationToken>())
            .Returns(new ReceiveMessageResponse
            {
                Messages =
                [
                    BuildMessage("session-1", "job-1", "receipt-1"),
                    BuildMessage("session-2", "job-2", "receipt-2")
                ]
            });

        processor.HandleAsync("session-1", "job-1")
            .ThrowsAsync(new InvalidOperationException("simulated failure"));

        processor.HandleAsync("session-2", "job-2").Returns(true);

        var loop = BuildLoop(sqs, processor);

        await loop.RunOnceAsync();

        await sqs.Received(1).DeleteMessageAsync(QueueUrl, "receipt-2", Arg.Any<CancellationToken>());
        await sqs.DidNotReceive().DeleteMessageAsync(QueueUrl, "receipt-1", Arg.Any<CancellationToken>());
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task RunOnceAsync_WhenMessagesCollectionIsNull_DoesNotThrowException()
    {
        var sqs = Substitute.For<IAmazonSQS>();
        var processor = Substitute.For<IJobProcessor>();

        sqs.ReceiveMessageAsync(Arg.Any<ReceiveMessageRequest>(), Arg.Any<CancellationToken>())
            .Returns(new ReceiveMessageResponse
            {
                Messages = null
            });

        var loop = BuildLoop(sqs, processor);

        var exception = await Record.ExceptionAsync(() => loop.RunOnceAsync());

        Assert.Null(exception);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task RunOnceAsync_WhenResponseIsNull_DoesNotThrowException()
    {
        var sqs = Substitute.For<IAmazonSQS>();
        var processor = Substitute.For<IJobProcessor>();

        sqs.ReceiveMessageAsync(Arg.Any<ReceiveMessageRequest>(), Arg.Any<CancellationToken>())
            .Returns((ReceiveMessageResponse)null!);

        var loop = BuildLoop(sqs, processor);

        var exception = await Record.ExceptionAsync(() => loop.RunOnceAsync());

        Assert.Null(exception);
    }
}
