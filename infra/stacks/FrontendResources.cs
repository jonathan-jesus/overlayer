using System.Text.Json;
using Pulumi;
using Pulumi.Aws.CloudFront;
using Pulumi.Aws.CloudFront.Inputs;
using Pulumi.Aws.S3;

namespace Overlayer.Infra.Stacks;

/// <summary>
/// Provisions the frontend hosting infrastructure:
/// - S3 bucket for Astro static assets
/// - CloudFront distribution with two origins: S3 (OAC) and HTTP API (proxy)
/// </summary>
public sealed class FrontendResources
{
    public Output<string> DistributionDomainName { get; }
    public Output<string> DistributionId { get; }
    public Output<string> FrontendBucketName { get; }
    internal Output<string> FrontendBucketArn { get; }
    internal Output<string> DistributionArn { get; }

    public FrontendResources(
        string stackName,
        InputMap<string> commonTags,
        Input<string> apiOriginUrl,
        Input<string> originSecret,
        string? acmCertificateArn)
    {
        #region S3 Bucket
        var bucket = new Bucket($"overlayer-frontend-{stackName}", new BucketArgs
        {
            BucketName = $"overlayer-frontend-{stackName}",
            Tags = commonTags,
        });

        _ = new BucketPublicAccessBlock($"overlayer-frontend-{stackName}-pab", new BucketPublicAccessBlockArgs
        {
            Bucket = bucket.Id,
            BlockPublicAcls = true,
            BlockPublicPolicy = true,
            IgnorePublicAcls = true,
            RestrictPublicBuckets = true,
        });
        #endregion

        #region CloudFront Origin Access Control
        var oac = new OriginAccessControl($"overlayer-frontend-{stackName}-oac", new OriginAccessControlArgs
        {
            Name = $"overlayer-frontend-{stackName}-oac",
            Description = "OAC for frontend S3 bucket",
            OriginAccessControlOriginType = "s3",
            SigningBehavior = "always",
            SigningProtocol = "sigv4",
        });
        #endregion

        #region CloudFront Distribution
        var s3OriginId = "S3Origin";
        var lambdaOriginId = "LambdaOrigin";

        var viewerCertificate = acmCertificateArn != null
            ? new DistributionViewerCertificateArgs
            {
                AcmCertificateArn = acmCertificateArn,
                SslSupportMethod = "sni-only",
                MinimumProtocolVersion = "TLSv1.2_2021",
            }
            : new DistributionViewerCertificateArgs
            {
                CloudfrontDefaultCertificate = true,
            };

        var aliases = acmCertificateArn != null
            ? new InputList<string> { stackName == "prod" ? "overlayer.jonsousa.dev" : "overlayer-dev.jonsousa.dev" }
            : new InputList<string>();

        var distribution = new Distribution($"overlayer-frontend-{stackName}-dist", new DistributionArgs
        {
            Enabled = true,
            IsIpv6Enabled = true,
            DefaultRootObject = "index.html",
            Aliases = aliases,
            ViewerCertificate = viewerCertificate,
            Tags = commonTags,
            Origins = new[]
            {
                new DistributionOriginArgs
                {
                    OriginId = s3OriginId,
                    DomainName = bucket.BucketRegionalDomainName,
                    OriginAccessControlId = oac.Id,
                },
                new DistributionOriginArgs
                {
                    OriginId = lambdaOriginId,
                    DomainName = apiOriginUrl.Apply(url => new Uri(url).Host),
                    CustomOriginConfig = new DistributionOriginCustomOriginConfigArgs
                    {
                        HttpPort = 80,
                        HttpsPort = 443,
                        OriginProtocolPolicy = "https-only",
                        OriginSslProtocols = { "TLSv1.2" },
                    },
                    CustomHeaders = new[]
                    {
                        new DistributionOriginCustomHeaderArgs
                        {
                            Name = "X-CloudFront-Secret",
                            Value = originSecret,
                        },
                    },
                },
            },
            DefaultCacheBehavior = new DistributionDefaultCacheBehaviorArgs
            {
                TargetOriginId = s3OriginId,
                ViewerProtocolPolicy = "redirect-to-https",
                AllowedMethods = { "GET", "HEAD", "OPTIONS" },
                CachedMethods = { "GET", "HEAD", "OPTIONS" },
                // AWS Managed Policy: CachingOptimized
                CachePolicyId = "658327ea-f89d-4fab-a63d-7e88639e58f6",
                Compress = true,
            },
            OrderedCacheBehaviors = new[]
            {
                new DistributionOrderedCacheBehaviorArgs
                {
                    PathPattern = "/api/*",
                    TargetOriginId = lambdaOriginId,
                    ViewerProtocolPolicy = "https-only",
                    AllowedMethods = { "GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE" },
                    CachedMethods = { "GET", "HEAD", "OPTIONS" },
                    // Cache disabled
                    MinTtl = 0,
                    DefaultTtl = 0,
                    MaxTtl = 0,
                    ForwardedValues = new DistributionOrderedCacheBehaviorForwardedValuesArgs
                    {
                        QueryString = true,
                        Headers = { "Authorization", "Content-Type", "X-Session-ID" },
                        Cookies = new DistributionOrderedCacheBehaviorForwardedValuesCookiesArgs { Forward = "all" },
                    },
                    Compress = true,
                },
            },
            CustomErrorResponses = new[]
            {
                new DistributionCustomErrorResponseArgs
                {
                    ErrorCode = 403,
                    ResponseCode = 200,
                    ResponsePagePath = "/index.html",
                    ErrorCachingMinTtl = 10,
                },
                new DistributionCustomErrorResponseArgs
                {
                    ErrorCode = 404,
                    ResponseCode = 200,
                    ResponsePagePath = "/index.html",
                    ErrorCachingMinTtl = 10,
                },
            },
            Restrictions = new DistributionRestrictionsArgs
            {
                GeoRestriction = new DistributionRestrictionsGeoRestrictionArgs
                {
                    RestrictionType = "none",
                },
            },
        });
        #endregion

        #region S3 Bucket Policy (OAC)
        var callerIdentity = Output.Create(Pulumi.Aws.GetCallerIdentity.InvokeAsync());
        var accountId = callerIdentity.Apply(c => c.AccountId);

        DistributionArn = Output.Tuple(accountId, distribution.Id).Apply(t =>
            $"arn:aws:cloudfront::{t.Item1}:distribution/{t.Item2}");

        _ = new BucketPolicy($"overlayer-frontend-{stackName}-policy", new BucketPolicyArgs
        {
            Bucket = bucket.Id,
            Policy = Output.Tuple(bucket.Arn, DistributionArn).Apply(t =>
            {
                var (bArn, dArn) = t;
                return JsonSerializer.Serialize(new
                {
                    Version = "2012-10-17",
                    Statement = new[]
                    {
                        new
                        {
                            Sid = "AllowCloudFrontServicePrincipal",
                            Effect = "Allow",
                            Principal = new { Service = "cloudfront.amazonaws.com" },
                            Action = "s3:GetObject",
                            Resource = $"{bArn}/*",
                            Condition = new Dictionary<string, object>
                            {
                                ["StringEquals"] = new Dictionary<string, string>
                                {
                                    ["aws:SourceArn"] = dArn,
                                },
                            },
                        },
                    },
                });
            }),
        });
        #endregion

        DistributionDomainName = distribution.DomainName;
        DistributionId = distribution.Id;
        FrontendBucketName = bucket.Id;
        FrontendBucketArn = bucket.Arn;
    }
}
