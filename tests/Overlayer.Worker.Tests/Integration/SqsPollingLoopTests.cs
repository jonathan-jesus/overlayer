using Amazon.SQS;
using NSubstitute;
using Overlayer.TestSupport.Infrastructure;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Messaging;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Integration;

[Collection("WorkerLocalStack")]
public class SqsPollingLoopTests(LocalStackFixture fixture)
{
    [Fact]
    [Trait("Category", "Integration")]
    public async Task RunOnceAsync_WithValidS3EventInQueue_InvokesHandleWithCorrectIds()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        var queueUrl = await fixture.CreateQueueAsync($"test-jobs-{Guid.NewGuid():N}");
        await fixture.SendMessageAsync(queueUrl, BuildS3EventJson(sessionId, jobId));

        var processor = Substitute.For<IJobProcessor>();
        using var sqs = fixture.GetSqsClient();
        var options = new SqsOptions
        {
            QueueUrl = queueUrl,
            WaitTimeSeconds = 0
        };
        var loop = new SqsPollingLoop(sqs, options, processor);

        await loop.RunOnceAsync();

        await processor.Received(1).HandleAsync(sessionId, jobId);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task RunOnceAsync_WhenProcessorReturnsCompleted_DeletesMessage()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        var queueUrl = await fixture.CreateQueueAsync($"test-jobs-completed-{Guid.NewGuid():N}");
        await fixture.SendMessageAsync(queueUrl, BuildS3EventJson(sessionId, jobId));

        var processor = Substitute.For<IJobProcessor>();
        processor.HandleAsync(sessionId, jobId).Returns(true);

        using var sqs = fixture.GetSqsClient();
        var options = new SqsOptions
        {
            QueueUrl = queueUrl,
            WaitTimeSeconds = 0
        };
        var loop = new SqsPollingLoop(sqs, options, processor);


        await loop.RunOnceAsync();

        var success = await WaitUntilQueueMetricsAsync(sqs, queueUrl, 0, 0, TimeSpan.FromSeconds(5));
        Assert.True(success, "Message was not deleted from the queue");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task RunOnceAsync_WhenProcessorReturnsFalse_DoesNotDeleteMessage()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        var queueUrl = await fixture.CreateQueueAsync($"test-jobs-aborted-{Guid.NewGuid():N}");
        await fixture.SendMessageAsync(queueUrl, BuildS3EventJson(sessionId, jobId));

        var processor = Substitute.For<IJobProcessor>();
        processor.HandleAsync(sessionId, jobId).Returns(false);

        using var sqs = fixture.GetSqsClient();
        var options = new SqsOptions
        {
            QueueUrl = queueUrl,
            WaitTimeSeconds = 0
        };
        var loop = new SqsPollingLoop(sqs, options, processor);

        await loop.RunOnceAsync();

        var attributes = await sqs.GetQueueAttributesAsync(queueUrl, new List<string> { "ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible" });
        int visible = int.Parse(attributes.Attributes["ApproximateNumberOfMessages"]);
        int notVisible = int.Parse(attributes.Attributes["ApproximateNumberOfMessagesNotVisible"]);

        Assert.Equal(1, visible + notVisible);
    }

    private static string BuildS3EventJson(string sessionId, string jobId) => $$"""
        {
          "Records": [{
            "s3": {
              "object": { "key": "jobs/{{sessionId}}/{{jobId}}/video.mp4" }
            }
          }]
        }
        """;

    private static async Task<bool> WaitUntilQueueMetricsAsync(IAmazonSQS sqs, string queueUrl, int expectedVisible, int expectedNotVisible, TimeSpan timeout)
    {
        var start = DateTime.UtcNow;
        while (DateTime.UtcNow - start < timeout)
        {
            var attributes = await sqs.GetQueueAttributesAsync(queueUrl, new List<string> { "ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible" });

            int visible = int.Parse(attributes.Attributes["ApproximateNumberOfMessages"]);
            int notVisible = int.Parse(attributes.Attributes["ApproximateNumberOfMessagesNotVisible"]);

            if (visible == expectedVisible && notVisible == expectedNotVisible)
                return true;

            await Task.Delay(100);
        }
        return false;
    }
}
