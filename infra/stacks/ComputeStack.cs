using System.Text.Json;
using Pulumi;
using Pulumi.Aws.AppAutoScaling;
using Pulumi.Aws.AppAutoScaling.Inputs;
using Pulumi.Aws.CloudWatch;
using Pulumi.Aws.Ec2;
using Pulumi.Aws.Ec2.Inputs;
using Pulumi.Aws.Ecr;
using Pulumi.Aws.Ecr.Inputs;
using Pulumi.Aws.Ecs;
using Pulumi.Aws.Ecs.Inputs;
using Pulumi.Aws.Iam;
using Pulumi.Aws.Lambda;
using Pulumi.Aws.Lambda.Inputs;

namespace Overlayer.Infra.Stacks;

/// <summary>
/// Root Pulumi stack. Composes <see cref="FoundationalResources"/> and
/// <see cref="ObservabilityResources"/> and provisions all compute-tier
/// resources: ECR, IAM roles, ECS cluster + task + service, Lambda function
/// and Function URL, and the EventBridge rule for unexpected ECS stops.
/// </summary>
public sealed class ComputeStack : Stack
{
    [Output] public Output<string> BucketName { get; private set; }
    [Output] public Output<string> QueueUrl { get; private set; }
    [Output] public Output<string> FunctionUrl { get; private set; }
    [Output] public Output<string>? DeployRoleArn { get; private set; }
    public ComputeStack()
    {
        var stackName = Deployment.Instance.StackName;
        var config = new Config("overlayer");
        var region = new Config("aws").Require("region");

        var ffmpegMinBitrate = config.Get("ffmpegMinBitrate") ?? "3000";
        var ffmpegMaxBitrate = config.Get("ffmpegMaxBitrate") ?? "6500";

        var commonTags = new InputMap<string>
        {
            ["Project"] = "overlayer",
            ["Environment"] = stackName,
            ["ManagedBy"] = "pulumi",
        };

        #region Foundational data-plane resources
        var foundational = new FoundationalResources(stackName, config, commonTags);

        BucketName = foundational.BucketName;
        QueueUrl = foundational.QueueUrl;

        // :latest tag is intentionally mutable. Images are deployed with :latest during
        // development. Switch to an immutable tag (e.g. git SHA) once a CI pipeline is
        // in place. scanOnPush surfaces known CVEs on every push at no cost.
        var ecrRepo = new Repository($"overlayer-worker-{stackName}", new RepositoryArgs
        {
            Name = $"overlayer-worker-{stackName}",
            ImageTagMutability = "MUTABLE",
            ImageScanningConfiguration = new RepositoryImageScanningConfigurationArgs
            {
                ScanOnPush = true,
            },
            ForceDelete = false,
            Tags = commonTags,
        });

        var workerTaskRole = new Role($"overlayer-worker-{stackName}-task-role", new RoleArgs
        {
            Name = $"overlayer-worker-{stackName}-task-role",
            AssumeRolePolicy = JsonSerializer.Serialize(new
            {
                Version = "2012-10-17",
                Statement = new[]
                {
                    new
                    {
                        Effect    = "Allow",
                        Principal = new { Service = "ecs-tasks.amazonaws.com" },
                        Action    = "sts:AssumeRole",
                    },
                },
            }),
            Tags = commonTags,
        });

        _ = new RolePolicy($"overlayer-worker-{stackName}-task-policy", new RolePolicyArgs
        {
            Role = workerTaskRole.Id,
            Policy = Output.Tuple(foundational.BucketArn, foundational.QueueArn).Apply(t =>
            {
                var (bucketArn, queueArn) = t;
                return JsonSerializer.Serialize(new
                {
                    Version = "2012-10-17",
                    Statement = new object[]
                    {
                        new
                        {
                            Sid      = "S3List",
                            Effect   = "Allow",
                            Action   = new[] { "s3:ListBucket" },
                            Resource = bucketArn,
                            Condition = new Dictionary<string, object>
                            {
                                ["StringLike"] = new Dictionary<string, object>
                                {
                                    ["s3:prefix"] = new[] { "jobs/*", "outputs/*", "locks/*" },
                                },
                            },
                        },
                        new
                        {
                            Sid      = "S3ReadJob",
                            Effect   = "Allow",
                            Action   = new[] { "s3:HeadObject", "s3:GetObject" },
                            Resource = new[] { $"{bucketArn}/jobs/*", $"{bucketArn}/outputs/*" },
                        },
                        new
                        {
                            Sid      = "S3Write",
                            Effect   = "Allow",
                            Action   = new[] { "s3:PutObject" },
                            Resource = new[] { $"{bucketArn}/locks/*", $"{bucketArn}/outputs/*" },
                        },
                        new
                        {
                            // AWS SDK requires sqs:GetQueueAttributes on startup.
                            Sid      = "SqsWorker",
                            Effect   = "Allow",
                            Action   = new[]
                            {
                                "sqs:ReceiveMessage",
                                "sqs:DeleteMessage",
                                "sqs:GetQueueAttributes",
                            },
                            Resource = queueArn,
                        },
                    },
                });
            }),
        });

        var ecsExecutionRole = new Role($"overlayer-ecs-{stackName}-execution-role", new RoleArgs
        {
            Name = $"overlayer-ecs-{stackName}-execution-role",
            AssumeRolePolicy = JsonSerializer.Serialize(new
            {
                Version = "2012-10-17",
                Statement = new[]
                {
                    new
                    {
                        Effect    = "Allow",
                        Principal = new { Service = "ecs-tasks.amazonaws.com" },
                        Action    = "sts:AssumeRole",
                    },
                },
            }),
            Tags = commonTags,
        });

        _ = new RolePolicyAttachment($"overlayer-ecs-{stackName}-execution-policy", new RolePolicyAttachmentArgs
        {
            Role = ecsExecutionRole.Name,
            PolicyArn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
        });

        var cluster = new Cluster($"overlayer-{stackName}", new ClusterArgs
        {
            Name = $"overlayer-{stackName}",
            Settings =
            [
                new ClusterSettingArgs { Name = "containerInsights", Value = "enabled" },
            ],
            Tags = commonTags,
        });

        var workerLogGroup = new LogGroup($"overlayer-{stackName}-worker-logs", new LogGroupArgs
        {
            Name = $"/overlayer/{stackName}/worker",
            RetentionInDays = 30,
            Tags = commonTags,
        });

        // Review Container Insights metrics for right-sizing (FFmpeg is CPU-bound).
        var containerDef = Output
            .Tuple(ecrRepo.RepositoryUrl, foundational.BucketName, foundational.QueueUrl, workerLogGroup.Name)
            .Apply(t =>
            {
                var (repoUrl, bucketName, queueUrl, logGroupName) = t;
                return JsonSerializer.Serialize(new[]
                {
                    new
                    {
                        name      = "worker",
                        image     = $"{repoUrl}:latest",
                        essential = true,
                        environment = new[]
                        {
                            new { name = "S3__BucketName",     value = bucketName },
                            new { name = "SQS__QueueUrl",      value = queueUrl },
                            new { name = "AWS__Region",        value = region },
                            new { name = "Ffmpeg__MinBitrate", value = ffmpegMinBitrate },
                            new { name = "Ffmpeg__MaxBitrate", value = ffmpegMaxBitrate },
                        },
                        logConfiguration = new
                        {
                            logDriver = "awslogs",
                            options   = new Dictionary<string, string>
                            {
                                ["awslogs-group"]         = logGroupName,
                                ["awslogs-region"]        = region,
                                ["awslogs-stream-prefix"] = "worker",
                            },
                        },
                    },
                });
            });

        var taskDef = new TaskDefinition($"overlayer-worker-{stackName}-task", new TaskDefinitionArgs
        {
            Family = $"overlayer-worker-{stackName}",
            RequiresCompatibilities = ["FARGATE"],
            NetworkMode = "awsvpc",
            Cpu = "256",
            Memory = "512",
            TaskRoleArn = workerTaskRole.Arn,
            ExecutionRoleArn = ecsExecutionRole.Arn,
            ContainerDefinitions = containerDef,
            Tags = commonTags,
        });

        var defaultVpc = GetVpc.Invoke(new GetVpcInvokeArgs { Default = true });
        var vpcId = defaultVpc.Apply(v => v.Id);

        var defaultSubnets = GetSubnets.Invoke(new GetSubnetsInvokeArgs
        {
            Filters =
            [
                new GetSubnetsFilterInputArgs
                {
                    Name   = "vpc-id",
                    Values = new InputList<string> { vpcId },
                },
            ],
        });

        var defaultSg = GetSecurityGroup.Invoke(new GetSecurityGroupInvokeArgs
        {
            Filters =
            [
                new GetSecurityGroupFilterInputArgs
                {
                    Name   = "group-name",
                    Values = ["default"],
                },
                new GetSecurityGroupFilterInputArgs
                {
                    Name   = "vpc-id",
                    Values = new InputList<string> { vpcId },
                },
            ],
        });

        // Prevent double-consumption during deploys. Start scaled to zero
        var workerService = new Service($"overlayer-worker-{stackName}-service", new ServiceArgs
        {
            Name = $"overlayer-worker-{stackName}",
            Cluster = cluster.Arn,
            TaskDefinition = taskDef.Arn,
            DesiredCount = 0,
            LaunchType = "FARGATE",
            DeploymentMinimumHealthyPercent = 0,
            DeploymentMaximumPercent = 100,
            NetworkConfiguration = new ServiceNetworkConfigurationArgs
            {
                AssignPublicIp = true,
                Subnets = defaultSubnets.Apply(s => s.Ids),
                SecurityGroups = new InputList<string> { defaultSg.Apply(sg => sg.Id) },
            },
            Tags = commonTags,
        });
        #endregion

        #region ECS Application Auto Scaling (scale-to-zero)
        var scalingTarget = new Target(
            $"overlayer-worker-{stackName}-scaling-target",
            new TargetArgs
            {
                ResourceId = Output.Tuple(cluster.Name, workerService.Name)
                    .Apply(t => $"service/{t.Item1}/{t.Item2}"),
                ServiceNamespace = "ecs",
                ScalableDimension = "ecs:service:DesiredCount",
                MinCapacity = 0,
                MaxCapacity = 2,
            });

        var scalingPolicy = new Pulumi.Aws.AppAutoScaling.Policy(
            $"overlayer-worker-{stackName}-scaling-policy",
            new Pulumi.Aws.AppAutoScaling.PolicyArgs
            {
                PolicyType = "StepScaling",
                ResourceId = scalingTarget.ResourceId,
                ServiceNamespace = scalingTarget.ServiceNamespace,
                ScalableDimension = scalingTarget.ScalableDimension,
                StepScalingPolicyConfiguration = new PolicyStepScalingPolicyConfigurationArgs
                {
                    AdjustmentType = "ExactCapacity",
                    Cooldown = 120,
                    MetricAggregationType = "Maximum",
                    StepAdjustments =
                    [
                        new PolicyStepScalingPolicyConfigurationStepAdjustmentArgs
                        {
                            MetricIntervalUpperBound = "0",
                            ScalingAdjustment        = 0,
                        },
                        new PolicyStepScalingPolicyConfigurationStepAdjustmentArgs
                        {
                            MetricIntervalLowerBound = "0",
                            ScalingAdjustment        = 1,
                        },
                    ],
                },
            });

        _ = new MetricAlarm(
            $"overlayer-{stackName}-sqs-scale-out",
            new MetricAlarmArgs
            {
                Name = $"overlayer-{stackName}-sqs-nonempty",
                Namespace = "AWS/SQS",
                MetricName = "ApproximateNumberOfMessagesVisible",
                Dimensions = new InputMap<string> { ["QueueName"] = foundational.QueueName },
                Statistic = "Sum",
                Period = 60,
                EvaluationPeriods = 1,
                Threshold = 1,
                ComparisonOperator = "GreaterThanOrEqualToThreshold",
                AlarmDescription = $"[overlayer/{stackName}] SQS queue non-empty. Scale worker out",
                AlarmActions = new InputList<string> { scalingPolicy.Arn },
                TreatMissingData = "notBreaching",
            });

        _ = new MetricAlarm(
            $"overlayer-{stackName}-sqs-scale-in",
            new MetricAlarmArgs
            {
                Name = $"overlayer-{stackName}-sqs-empty",
                Namespace = "AWS/SQS",
                MetricName = "ApproximateNumberOfMessagesVisible",
                Dimensions = new InputMap<string> { ["QueueName"] = foundational.QueueName },
                Statistic = "Sum",
                Period = 60,
                EvaluationPeriods = 1,
                Threshold = 1,
                ComparisonOperator = "LessThanThreshold",
                AlarmDescription = $"[overlayer/{stackName}] SQS queue empty. Scale worker in",
                OkActions = new InputList<string> { scalingPolicy.Arn },
                TreatMissingData = "notBreaching",
            });
        #endregion

        #region Lambda CloudWatch Log Group
        var lambdaLogGroup = new LogGroup($"overlayer-{stackName}-api-logs", new LogGroupArgs
        {
            Name = $"/aws/lambda/overlayer-{stackName}-api",
            RetentionInDays = 30,
            Tags = commonTags,
        });

        // Allows GET /api/jobs state inference.
        var lambdaRole = new Role($"overlayer-{stackName}-lambda-role", new RoleArgs
        {
            Name = $"overlayer-{stackName}-lambda-role",
            AssumeRolePolicy = JsonSerializer.Serialize(new
            {
                Version = "2012-10-17",
                Statement = new[]
                {
                    new
                    {
                        Effect    = "Allow",
                        Principal = new { Service = "lambda.amazonaws.com" },
                        Action    = "sts:AssumeRole",
                    },
                },
            }),
            Tags = commonTags,
        });

        _ = new RolePolicy($"overlayer-{stackName}-lambda-policy", new RolePolicyArgs
        {
            Role = lambdaRole.Id,
            Policy = Output.Tuple(foundational.BucketArn, lambdaLogGroup.Arn).Apply(t =>
            {
                var (bucketArn, logGroupArn) = t;
                return JsonSerializer.Serialize(new
                {
                    Version = "2012-10-17",
                    Statement = new object[]
                    {
                        new
                        {
                            Sid      = "S3Upload",
                            Effect   = "Allow",
                            Action   = new[] { "s3:PutObject" },
                            Resource = $"{bucketArn}/jobs/*",
                        },
                        new
                        {
                            Sid      = "S3List",
                            Effect   = "Allow",
                            Action   = new[] { "s3:ListBucket" },
                            Resource = bucketArn,
                            Condition = new Dictionary<string, object>
                            {
                                ["StringLike"] = new Dictionary<string, object>
                                {
                                    ["s3:prefix"] = new[] { "jobs/*", "outputs/*", "locks/*" },
                                },
                            },
                        },
                        new
                        {
                            Sid      = "S3Head",
                            Effect   = "Allow",
                            Action   = new[] { "s3:HeadObject", "s3:GetObject" },
                            Resource = new[] { $"{bucketArn}/jobs/*", $"{bucketArn}/outputs/*" },
                        },
                        new
                        {
                            Sid      = "Logs",
                            Effect   = "Allow",
                            Action   = new[]
                            {
                                "logs:CreateLogGroup",
                                "logs:CreateLogStream",
                                "logs:PutLogEvents",
                            },
                            Resource = $"{logGroupArn}:*",
                        },
                    },
                });
            }),
        });

        // Lambda code is owned by CI after the first deploy. The placeholder zip gives
        // Pulumi a stable, committed hash so that `pulumi up` never overwrites what CI
        // last deployed. Path is relative to infra/ (the Pulumi working directory).
        var lambda = new Function($"overlayer-{stackName}-api", new FunctionArgs
        {
            Name = $"overlayer-{stackName}-api",
            Runtime = "dotnet10",
            Handler = "Overlayer.Api",
            Code = new FileArchive("bootstrap/lambda-placeholder.zip"),
            MemorySize = 512,
            Timeout = 30,
            Role = lambdaRole.Arn,
            Environment = new FunctionEnvironmentArgs
            {
                Variables = new InputMap<string>
                {
                    ["S3__BucketName"] = foundational.BucketName,
                    ["AWS__Region"] = region,
                },
            },
            Tags = commonTags,
        });

        var urlResource = new FunctionUrl($"overlayer-{stackName}-api-url", new FunctionUrlArgs
        {
            FunctionName = lambda.Name,
            AuthorizationType = "NONE",
            Cors = new FunctionUrlCorsArgs
            {
                AllowOrigins = ["*"],
                AllowMethods = ["*"],
                AllowHeaders = ["*"],
            },
        });

        FunctionUrl = urlResource.FunctionUrlResult;
        #endregion

        #region ECS Unexpected Stop EventBridge Rule
        var ecsStopRule = new EventRule($"overlayer-{stackName}-ecs-stop-rule", new EventRuleArgs
        {
            Name = $"overlayer-{stackName}-ecs-unexpected-stop",
            Description = $"[overlayer/{stackName}] ECS task stopped unexpectedly",
            EventPattern = JsonSerializer.Serialize(new Dictionary<string, object>
            {
                ["source"] = new[] { "aws.ecs" },
                ["detail-type"] = new[] { "ECS Task State Change" },
                ["detail"] = new Dictionary<string, object>
                {
                    ["lastStatus"] = new[] { "STOPPED" },
                    // EssentialContainerExited is not excluded. The worker runs indefinitely so any
                    // self-exit, even code 0, is unexpected. Revisit if the worker ever exits cleanly by design.
                    ["stopCode"] = new[]
                    {
                        new Dictionary<string, object>
                        {
                            ["anything-but"] = new[] { "ServiceSchedulerInitiated", "UserInitiated" },
                        },
                    },
                },
            }),
        });
        #endregion

        _ = new ObservabilityResources(
            stackName, config, commonTags,
            dlqName: foundational.DlqName,
            mainQueueName: foundational.QueueName,
            lambdaName: lambda.Name,
            ecsStopRuleName: ecsStopRule.Name,
            ecsStopRuleArn: ecsStopRule.Arn);

        // CI/CD trust infrastructure. Service ARNs are composed here from Output<string> values to avoid string-splitting.
        var workerServiceArn = Output.Tuple(cluster.Arn, cluster.Name, workerService.Name)
            .Apply(t =>
            {
                var (clusterArnVal, clusterNameVal, serviceNameVal) = t;
                var prefix = string.Join(":", clusterArnVal.Split(':')[..5]);
                return $"{prefix}:service/{clusterNameVal}/{serviceNameVal}";
            });

        var ciCd = new CiCdStack(
            stackName,
            commonTags,
            ecrRepoArn: ecrRepo.Arn,
            workerTaskRoleArn: workerTaskRole.Arn,
            lambdaArn: lambda.Arn,
            devServiceArn: workerServiceArn,
            prodServiceArn: workerServiceArn);

        DeployRoleArn = ciCd.DeployRoleArn;

    }
}
