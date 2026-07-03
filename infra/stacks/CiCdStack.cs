using System.Text.Json;
using Pulumi;
using Pulumi.Aws.Iam;
using Pulumi.Aws.S3;

namespace Overlayer.Infra.Stacks;

/// <summary>
/// Provisions CI/CD trust infrastructure for GitHub Actions OIDC authentication.
///
/// Resources created:
/// <list type="bullet">
///   <item>GitHub OIDC provider for <c>token.actions.githubusercontent.com</c></item>
///   <item>Branch-scoped IAM deploy role for <c>dev</c></item>
///   <item>Branch-scoped IAM deploy role for <c>main</c> (prod)</item>
///   <item>Private S3 bucket for Lambda deployment artifacts</item>
/// </list>
/// </summary>
public sealed class CiCdStack
{
    public Output<string>? DeployRoleArn { get; }

    public CiCdStack(
        string stackName,
        InputMap<string> commonTags,
        Input<string> ecrRepoArn,
        Input<string> workerTaskRoleArn,
        Input<string> lambdaArn,
        Input<string> devServiceArn,
        Input<string> prodServiceArn,
        Input<string> frontendBucketArn,
        Input<string> distributionArn)
    {
        var oidcProvider = Output.Create(GetOpenIdConnectProvider.InvokeAsync(new GetOpenIdConnectProviderArgs
        {
            Url = "https://token.actions.githubusercontent.com",
        }));
        var oidcProviderArn = oidcProvider.Apply(p => p.Arn);

        #region Lambda Artifact S3 Bucket
        var artifactBucket = new Bucket($"overlayer-lambda-artifacts-{stackName}", new BucketArgs
        {
            BucketName = $"overlayer-lambda-artifacts-{stackName}",
            Tags = commonTags,
        });

        _ = new BucketPublicAccessBlock($"overlayer-lambda-artifacts-{stackName}-pab", new BucketPublicAccessBlockArgs
        {
            Bucket = artifactBucket.Id,
            BlockPublicAcls = true,
            BlockPublicPolicy = true,
            IgnorePublicAcls = true,
            RestrictPublicBuckets = true,
        });
        #endregion

        #region Per-environment inline permissions policies
        Input<string> artifactBucketArnInput = artifactBucket.Arn;

        Output<string> BuildPolicy(Input<string> serviceArn) =>
            Output.Tuple(
                ecrRepoArn,
                workerTaskRoleArn,
                lambdaArn,
                artifactBucketArnInput,
                serviceArn,
                frontendBucketArn,
                distributionArn
            ).Apply(t =>
            {
                var (ecrArn, taskRoleArn, fnArn, bucketArn, svcArn, frontBucketArn, distArn) = t;

                return JsonSerializer.Serialize(new
                {
                    Version = "2012-10-17",
                    Statement = new object[]
                    {
                        new
                        {
                            Sid    = "EcrAuth",
                            Effect = "Allow",
                            Action   = new[] { "ecr:GetAuthorizationToken" },
                            Resource = "*",
                        },
                        new
                        {
                            Sid    = "EcrImagePush",
                            Effect = "Allow",
                            Action = new[]
                            {
                                "ecr:BatchCheckLayerAvailability",
                                "ecr:PutImage",
                                "ecr:InitiateLayerUpload",
                                "ecr:UploadLayerPart",
                                "ecr:CompleteLayerUpload",
                            },
                            Resource = ecrArn,
                        },
                        new
                        {
                            Sid    = "EcsRegisterTaskDef",
                            Effect = "Allow",
                            Action = new[] { "ecs:RegisterTaskDefinition" },
                            Resource = "*",
                        },
                        new
                        {
                            Sid    = "EcsDeployService",
                            Effect = "Allow",
                            Action = new[]
                            {
                                "ecs:UpdateService",
                                "ecs:DescribeServices",
                            },
                            Resource = svcArn,
                        },
                        new
                        {
                            Sid    = "LambdaDeploy",
                            Effect = "Allow",
                            Action = new[]
                            {
                                "lambda:UpdateFunctionCode",
                                "lambda:PublishVersion",
                            },
                            Resource = fnArn,
                        },
                        new
                        {
                            Sid      = "PassWorkerTaskRole",
                            Effect   = "Allow",
                            Action   = new[] { "iam:PassRole" },
                            Resource = taskRoleArn,
                        },
                        new
                        {
                            Sid    = "S3Artifacts",
                            Effect = "Allow",
                            Action = new[] { "s3:PutObject", "s3:GetObject" },
                            Resource = $"{bucketArn}/*",
                        },
                        new
                        {
                            Sid = "S3FrontendSync",
                            Effect = "Allow",
                            Action = new[] { "s3:PutObject", "s3:DeleteObject", "s3:ListBucket" },
                            Resource = new[] { frontBucketArn, $"{frontBucketArn}/*" },
                        },
                        new
                        {
                            Sid = "CloudFrontInvalidate",
                            Effect = "Allow",
                            Action = new[] { "cloudfront:CreateInvalidation" },
                            Resource = distArn,
                        },
                    },
                });
            });

        if (stackName == "dev")
        {
            var devInlinePolicy = BuildPolicy(devServiceArn);
            var devDeployRole = new Role($"overlayer-github-deploy-dev", new RoleArgs
            {
                Name = $"overlayer-github-deploy-dev",
                AssumeRolePolicy = oidcProviderArn.Apply(providerArn => JsonSerializer.Serialize(new
                {
                    Version = "2012-10-17",
                    Statement = new[]
                    {
                        new
                        {
                            Effect    = "Allow",
                            Principal = new { Federated = providerArn },
                            Action    = "sts:AssumeRoleWithWebIdentity",
                            Condition = new
                            {
                                StringEquals = new Dictionary<string, string>
                                {
                                    ["token.actions.githubusercontent.com:aud"] = "sts.amazonaws.com",
                                },
                                StringLike = new Dictionary<string, string>
                                {
                                    ["token.actions.githubusercontent.com:sub"] = "repo:jonathan-jesus/overlayer:ref:refs/heads/dev",
                                },
                            },
                        },
                    },
                })),
                Tags = commonTags,
            });

            _ = new RolePolicy($"overlayer-github-deploy-dev-policy", new RolePolicyArgs
            {
                Role = devDeployRole.Id,
                Policy = devInlinePolicy,
            });

            DeployRoleArn = devDeployRole.Arn;
        }
        else if (stackName == "prod")
        {
            var prodInlinePolicy = BuildPolicy(prodServiceArn);
            var prodDeployRole = new Role($"overlayer-github-deploy-prod", new RoleArgs
            {
                Name = $"overlayer-github-deploy-prod",
                AssumeRolePolicy = oidcProviderArn.Apply(providerArn => JsonSerializer.Serialize(new
                {
                    Version = "2012-10-17",
                    Statement = new[]
                    {
                        new
                        {
                            Effect    = "Allow",
                            Principal = new { Federated = providerArn },
                            Action    = "sts:AssumeRoleWithWebIdentity",
                            Condition = new
                            {
                                StringEquals = new Dictionary<string, string>
                                {
                                    ["token.actions.githubusercontent.com:aud"] = "sts.amazonaws.com",
                                },
                                StringLike = new Dictionary<string, string>
                                {
                                    ["token.actions.githubusercontent.com:sub"] = "repo:jonathan-jesus/overlayer:ref:refs/heads/main",
                                },
                            },
                        },
                    },
                })),
                Tags = commonTags,
            });

            _ = new RolePolicy($"overlayer-github-deploy-prod-policy", new RolePolicyArgs
            {
                Role = prodDeployRole.Id,
                Policy = prodInlinePolicy,
            });

            DeployRoleArn = prodDeployRole.Arn;
        }
        #endregion
    }
}
