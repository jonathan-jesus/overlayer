using System.Text.Json;
using Pulumi;
using Pulumi.Aws.CloudWatch;
using Pulumi.Aws.Sns;

namespace Overlayer.Infra.Stacks;

/// <summary>
/// Provisions all observability resources: SNS topic, CloudWatch alarms, and the
/// EventBridge target. Alarms are centralised here so the SNS ARN is available in
/// <c>AlarmActions</c> immediately.
/// </summary>
public sealed class ObservabilityResources
{
    public ObservabilityResources(
        string stackName,
        Config config,
        InputMap<string> commonTags,
        Input<string> dlqName,
        Input<string> mainQueueName,
        Input<string> lambdaName,
        Input<string> ecsStopRuleName,
        Output<string> ecsStopRuleArn)
    {
        var topic = new Topic($"overlayer-alerts-{stackName}", new TopicArgs
        {
            Name = $"overlayer-alerts-{stackName}",
            Tags = commonTags,
        });

        _ = new TopicSubscription($"overlayer-alerts-{stackName}-email", new TopicSubscriptionArgs
        {
            Protocol = "email",
            Endpoint = config.Require("alertEmail"),
            Topic = topic.Arn,
        });

        _ = new TopicPolicy($"overlayer-alerts-{stackName}-eb-policy", new TopicPolicyArgs
        {
            Arn = topic.Arn,
            Policy = Output.Tuple(topic.Arn, ecsStopRuleArn).Apply(t =>
            {
                var (topicArn, ruleArn) = t;
                return JsonSerializer.Serialize(new
                {
                    Version = "2012-10-17",
                    Statement = new[]
                    {
                        new
                        {
                            Sid       = "AllowEventBridgePublish",
                            Effect    = "Allow",
                            Principal = new { Service = "events.amazonaws.com" },
                            Action    = "sns:Publish",
                            Resource  = topicArn,
                            Condition = new
                            {
                                ArnLike = new Dictionary<string, string>
                                {
                                    ["aws:SourceArn"] = ruleArn,
                                },
                            },
                        },
                    },
                });
            }),
        });

        #region DLQ Depth Alarm
        _ = new MetricAlarm($"overlayer-dlq-{stackName}-alarm", new MetricAlarmArgs
        {
            Name = $"overlayer-dlq-{stackName}-depth",
            Namespace = "AWS/SQS",
            MetricName = "ApproximateNumberOfMessagesVisible",
            Dimensions = new InputMap<string> { ["QueueName"] = dlqName },
            Statistic = "Sum",
            Period = 60,
            EvaluationPeriods = 1,
            Threshold = 1,
            ComparisonOperator = "GreaterThanOrEqualToThreshold",
            AlarmDescription = $"[overlayer/{stackName}] DLQ has messages - Investigate immediately",
            AlarmActions = new InputList<string> { topic.Arn },
            TreatMissingData = "notBreaching",
        });
        #endregion

        #region Lambda Error Rate Alarm
        _ = new MetricAlarm($"overlayer-{stackName}-lambda-error-alarm", new MetricAlarmArgs
        {
            Name = $"overlayer-{stackName}-lambda-error-rate",
            Namespace = "AWS/Lambda",
            MetricName = "Errors",
            Dimensions = new InputMap<string> { ["FunctionName"] = lambdaName },
            Statistic = "Sum",
            Period = 60,
            EvaluationPeriods = 1,
            Threshold = 1,
            ComparisonOperator = "GreaterThanOrEqualToThreshold",
            AlarmDescription = $"[overlayer/{stackName}] Lambda error count >= 1 - investigate",
            AlarmActions = new InputList<string> { topic.Arn },
            TreatMissingData = "notBreaching",
        });
        #endregion

        #region ECS Unexpected Stop - EventBridge Target
        _ = new EventTarget($"overlayer-{stackName}-ecs-stop-target", new EventTargetArgs
        {
            Rule = ecsStopRuleName,
            Arn = topic.Arn,
        });
        #endregion 

        #region Lambda P99 Duration Alarm
        // Threshold: 25s - 5s buffer before the 30s Lambda timeout.
        _ = new MetricAlarm($"overlayer-{stackName}-lambda-p99-alarm", new MetricAlarmArgs
        {
            Name = $"overlayer-{stackName}-lambda-p99-duration",
            Namespace = "AWS/Lambda",
            MetricName = "Duration",
            Dimensions = new InputMap<string> { ["FunctionName"] = lambdaName },
            ExtendedStatistic = "p99",
            Period = 60,
            EvaluationPeriods = 1,
            Threshold = 25_000,
            ComparisonOperator = "GreaterThanOrEqualToThreshold",
            AlarmDescription = $"[overlayer/{stackName}] Lambda p99 duration >= 25 s - approaching 30 s timeout",
            AlarmActions = new InputList<string> { topic.Arn },
            TreatMissingData = "notBreaching",
        });
        #endregion 

        #region SQS In-Flight Depth Alarm
        // Threshold >= 2 means both worker task slots are occupied. Reaching this means no spare capacity remains.
        _ = new MetricAlarm($"overlayer-{stackName}-sqs-inflight-alarm", new MetricAlarmArgs
        {
            Name = $"overlayer-{stackName}-sqs-inflight-depth",
            Namespace = "AWS/SQS",
            MetricName = "ApproximateNumberOfMessagesNotVisible",
            Dimensions = new InputMap<string> { ["QueueName"] = mainQueueName },
            Statistic = "Maximum",
            Period = 60,
            EvaluationPeriods = 1,
            Threshold = 2,
            ComparisonOperator = "GreaterThanOrEqualToThreshold",
            AlarmDescription = $"[overlayer/{stackName}] SQS in-flight messages >= 2 - Worker processing slower than arrival rate",
            AlarmActions = new InputList<string> { topic.Arn },
            TreatMissingData = "notBreaching",
        });
        #endregion 

    }
}
