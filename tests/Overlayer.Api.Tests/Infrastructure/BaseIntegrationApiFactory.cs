using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Overlayer.Api.Configuration;

namespace Overlayer.Api.Tests.Infrastructure;

public abstract class BaseIntegrationApiFactory : WebApplicationFactory<Program>
{
    private readonly string _connectionString;
    private readonly string _bucketName;
    private readonly string _dynamoDbConnectionString;
    private readonly string _rateLimitTableName;
    private readonly RateLimitOptions _rateLimitOptions;

    protected BaseIntegrationApiFactory(
        string connectionString,
        string bucketName,
        string dynamoDbConnectionString,
        string rateLimitTableName = "overlayer-rate-limits-test",
        RateLimitOptions? rateLimitOptions = default)
    {
        _connectionString = connectionString;
        _bucketName = bucketName;
        _dynamoDbConnectionString = dynamoDbConnectionString;
        _rateLimitTableName = rateLimitTableName;
        _rateLimitOptions = rateLimitOptions ?? new RateLimitOptions();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["S3:ServiceUrl"] = _connectionString,
                ["S3:BucketName"] = _bucketName,
                ["S3:Region"] = "us-east-2",
                ["S3:ForcePathStyle"] = "true",
                ["S3:AccessKey"] = "test",
                ["S3:SecretKey"] = "test",
                ["CloudFront:OriginSecret"] = "test-secret",
                ["DynamoDB:ServiceUrl"] = _dynamoDbConnectionString,
                ["DynamoDB:AccessKey"] = "test",
                ["DynamoDB:SecretKey"] = "test",
                ["DynamoDB:Region"] = "us-east-2",
                ["RateLimit:TableName"] = _rateLimitTableName,
                ["RateLimit:WindowSeconds"] = _rateLimitOptions.WindowSeconds.ToString(),
                ["RateLimit:UploadUrls:SessionLimit"] = _rateLimitOptions.UploadUrls.SessionLimit.ToString(),
                ["RateLimit:UploadUrls:IpLimit"] = _rateLimitOptions.UploadUrls.IpLimit?.ToString(),
                ["RateLimit:Jobs:SessionLimit"] = _rateLimitOptions.Jobs.SessionLimit.ToString(),
                ["RateLimit:Jobs:IpLimit"] = _rateLimitOptions.Jobs.IpLimit?.ToString(),
            });
        });
    }

    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        client.DefaultRequestHeaders.Add("X-CloudFront-Secret", "test-secret");
    }
}
