using Amazon.SQS;
using Amazon.SQS.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Tests.Acceptance;

public class MessageConsumptionTests
{
    private static IHost BuildHost(Action<IServiceCollection> overrides) =>
        Program.BuildHost([], overrides);

    [Fact]
    [Trait("Category", "Acceptance")]
    public async Task WhenMessageArrives_IsProcessedAndDeleted()
    {
        const string sessionId = "test-session-id";
        const string jobId = "test-job-id";
        const string receiptHandle = "sqs-message-receipt";

        var messageBody = $$"""
            {
                "Records": [{
                    "s3": {
                        "object": {
                            "key": "jobs/{{sessionId}}/{{jobId}}/video.mp4"
                        }
                    }
                }]
            }
            """;

        var sqsClient = Substitute.For<IAmazonSQS>();
        bool messageDelivered = false;

        sqsClient
            .ReceiveMessageAsync(Arg.Any<ReceiveMessageRequest>(), Arg.Any<CancellationToken>())
            .Returns(_ =>
            {
                if (messageDelivered)
                    return new ReceiveMessageResponse { Messages = [] };

                messageDelivered = true;
                return new ReceiveMessageResponse
                {
                    Messages =
                    [
                        new Message
                        {
                            MessageId = Guid.NewGuid().ToString(),
                            ReceiptHandle = receiptHandle,
                            Body = messageBody
                        }
                    ]
                };
            });

        string? deletedReceiptHandle = null;
        sqsClient
            .DeleteMessageAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                deletedReceiptHandle = callInfo.ArgAt<string>(1);
                return new DeleteMessageResponse();
            });


        string? receivedSessionId = null;
        string? receivedJobId = null;
        var jobProcessor = Substitute.For<IJobProcessor>();
        jobProcessor
            .HandleAsync(Arg.Any<string>(), Arg.Any<string>())
            .Returns(callInfo =>
            {
                receivedSessionId = callInfo.ArgAt<string>(0);
                receivedJobId = callInfo.ArgAt<string>(1);
                return Task.FromResult(true);
            });

        using var host = BuildHost(services =>
        {
            services.AddSingleton<IAmazonSQS>(sqsClient);
            services.AddSingleton<IJobProcessor>(jobProcessor);
        });

        await host.StartAsync();
        await Task.Delay(200);
        await host.StopAsync();

        Assert.Equal(sessionId, receivedSessionId);
        Assert.Equal(jobId, receivedJobId);
        Assert.Equal(receiptHandle, deletedReceiptHandle);
    }

    [Fact]
    [Trait("Category", "Acceptance")]
    public void BuildHost_WithRealServices_ShouldResolveDependencyGraph()
    {
        var envs = new Dictionary<string, string?>
    {
        { "SQS__QueueUrl", "http://localhost:4566/000000000000/test-queue" },
        { "S3__BucketName", "test-bucket" },
        { "S3__ServiceUrl", "http://localhost:4566" }
    };

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(envs)
            .Build();

        var host = Program.BuildHost([]);

        var exception = Record.Exception(() =>
        {
            using var scope = host.Services.CreateScope();
            scope.ServiceProvider.GetRequiredService<IHostedService>();
        });

        Assert.Null(exception);
    }
}
