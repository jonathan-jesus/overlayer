using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Overlayer.Api.Tests.Infrastructure;

public abstract class BaseIntegrationApiFactory : WebApplicationFactory<Program>
{
    private readonly string _connectionString;
    private readonly string _bucketName;

    protected BaseIntegrationApiFactory(string connectionString, string bucketName)
    {
        _connectionString = connectionString;
        _bucketName = bucketName;
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
                ["CloudFront:OriginSecret"] = "test-secret"
            });
        });
    }

    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        client.DefaultRequestHeaders.Add("X-CloudFront-Secret", "test-secret");
    }
}
