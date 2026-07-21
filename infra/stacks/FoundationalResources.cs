using System.Text.Json;
using Pulumi;
using Pulumi.Aws.DynamoDB;
using Pulumi.Aws.DynamoDB.Inputs;
using Pulumi.Aws.S3;
using Pulumi.Aws.S3.Inputs;
using Pulumi.Aws.Sqs;

namespace Overlayer.Infra.Stacks;

/// <summary>
/// Creates the foundational data-plane infrastructure for Overlayer:
/// S3 bucket, SQS with DLQ, S3-to-SQS notifications, and the DynamoDB rate-limit table.
/// </summary>
public sealed class FoundationalResources
{
    public Output<string> BucketName { get; }
    public Output<string> QueueUrl { get; }
    internal Output<string> BucketArn { get; }
    internal Output<string> QueueArn { get; }
    internal Output<string> QueueName { get; }
    internal Output<string> DlqName { get; }
    internal Output<string> RateLimitTableName { get; }
    internal Output<string> RateLimitTableArn { get; }
    public FoundationalResources(string stackName, Config config, InputMap<string> commonTags, string corsAllowedOrigin)
    {
        var visibilityTimeout = config.GetInt32("sqsVisibilityTimeoutSeconds") ?? 300;
        var dlqRetentionSeconds = config.GetInt32("dlqMessageRetentionSeconds") ?? 1_209_600;

        #region S3 Bucket
        var bucket = new Bucket($"overlayer-{stackName}", new BucketArgs
        {
            BucketName = $"overlayer-{stackName}",
            Tags = commonTags,
        });

        _ = new BucketPublicAccessBlock($"overlayer-{stackName}-pab", new BucketPublicAccessBlockArgs
        {
            Bucket = bucket.Id,
            BlockPublicAcls = true,
            BlockPublicPolicy = true,
            IgnorePublicAcls = true,
            RestrictPublicBuckets = true,
        });

        _ = new BucketCorsConfiguration($"overlayer-{stackName}-cors", new BucketCorsConfigurationArgs
        {
            Bucket = bucket.Id,
            CorsRules =
            [
                new BucketCorsConfigurationCorsRuleArgs
                {
                    AllowedOrigins = [.. corsAllowedOrigin.Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries)],
                    AllowedMethods = ["POST"],
                    AllowedHeaders = ["*"],
                    ExposeHeaders  = [],
                    MaxAgeSeconds  = 3000,
                },
            ],
        });

        _ = new BucketLifecycleConfiguration($"overlayer-{stackName}-lifecycle", new BucketLifecycleConfigurationArgs
        {
            Bucket = bucket.Id,
            Rules =
            [
                new BucketLifecycleConfigurationRuleArgs
                {
                    Id     = "expire-jobs",
                    Status = "Enabled",
                    Filter = new BucketLifecycleConfigurationRuleFilterArgs { Prefix = "jobs/" },
                    Expiration = new BucketLifecycleConfigurationRuleExpirationArgs { Days = 7 },
                },
                new BucketLifecycleConfigurationRuleArgs
                {
                    Id     = "expire-locks",
                    Status = "Enabled",
                    Filter = new BucketLifecycleConfigurationRuleFilterArgs { Prefix = "locks/" },
                    Expiration = new BucketLifecycleConfigurationRuleExpirationArgs { Days = 1 },
                },
                new BucketLifecycleConfigurationRuleArgs
                {
                    Id     = "expire-outputs",
                    Status = "Enabled",
                    Filter = new BucketLifecycleConfigurationRuleFilterArgs { Prefix = "outputs/" },
                    Expiration = new BucketLifecycleConfigurationRuleExpirationArgs { Days = 7 },
                },
            ],
        });
        #endregion

        #region SQS Dead Letter Queue
        var dlq = new Queue($"overlayer-dlq-{stackName}", new QueueArgs
        {
            Name = $"overlayer-dlq-{stackName}",
            MessageRetentionSeconds = dlqRetentionSeconds,
            Tags = commonTags,
        });
        #endregion

        #region SQS Main Queue
        // Visibility timeout must exceed max FFmpeg job duration. 20s long polling reduces SQS costs.
        var queue = new Queue($"overlayer-queue-{stackName}", new QueueArgs
        {
            Name = $"overlayer-queue-{stackName}",
            VisibilityTimeoutSeconds = visibilityTimeout,
            ReceiveWaitTimeSeconds = 20,
            RedrivePolicy = dlq.Arn.Apply(arn => JsonSerializer.Serialize(new
            {
                deadLetterTargetArn = arn,
                maxReceiveCount = 3,
            })),
            Tags = commonTags,
        });
        #endregion

        #region SQS Queue Policy
        var queuePolicy = new QueuePolicy($"overlayer-queue-{stackName}-policy", new QueuePolicyArgs
        {
            QueueUrl = queue.Url,
            Policy = Output.Tuple(queue.Arn, bucket.Arn).Apply(t =>
            {
                var (queueArn, bucketArn) = t;
                var policy = new Dictionary<string, object>
                {
                    ["Version"] = "2012-10-17",
                    ["Statement"] = new[]
                    {
                        new Dictionary<string, object>
                        {
                            ["Sid"]       = "AllowS3ToSendMessage",
                            ["Effect"]    = "Allow",
                            ["Principal"] = new Dictionary<string, string> { ["Service"] = "s3.amazonaws.com" },
                            ["Action"]    = "sqs:SendMessage",
                            ["Resource"]  = queueArn,
                            ["Condition"] = new Dictionary<string, object>
                            {
                                ["ArnLike"] = new Dictionary<string, string>
                                {
                                    ["aws:SourceArn"] = bucketArn,
                                },
                            },
                        },
                    },
                };
                return JsonSerializer.Serialize(policy);
            }),
        });
        #endregion

        #region S3 Bucket Notification
        _ = new BucketNotification($"overlayer-{stackName}-notification", new BucketNotificationArgs
        {
            Bucket = bucket.Id,
            Queues =
            [
                new BucketNotificationQueueArgs
                {
                    QueueArn     = queue.Arn,
                    Events       = ["s3:ObjectCreated:*"],
                    FilterPrefix = "jobs/",
                },
            ],
        }, new CustomResourceOptions { DependsOn = { queuePolicy } });
        #endregion

        #region DynamoDB Rate-Limit Table
        var rateLimitTable = new Table($"overlayer-rate-limits-{stackName}", new TableArgs
        {
            Name = $"overlayer-rate-limits-{stackName}",
            BillingMode = "PAY_PER_REQUEST",
            HashKey = "Id",
            Attributes = [new TableAttributeArgs { Name = "Id", Type = "S" }],
            Ttl = new TableTtlArgs { AttributeName = "ExpiresAt", Enabled = true },
            Tags = commonTags,
        });
        #endregion

        BucketName = bucket.Id;
        QueueUrl = queue.Url;
        BucketArn = bucket.Arn;
        QueueArn = queue.Arn;
        QueueName = queue.Name;
        DlqName = dlq.Name;
        RateLimitTableName = rateLimitTable.Name;
        RateLimitTableArn = rateLimitTable.Arn;
    }
}
