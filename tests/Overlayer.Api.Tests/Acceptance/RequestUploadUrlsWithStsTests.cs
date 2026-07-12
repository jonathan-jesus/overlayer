using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Overlayer.Api.Services;

namespace Overlayer.Api.Tests.Acceptance;

public class RequestUploadUrlsWithStsTests : IClassFixture<RequestUploadUrlsWithStsTests.StsFactory>
{
    private readonly HttpClient _client;

    public RequestUploadUrlsWithStsTests(StsFactory factory)
    {
        _client = factory.CreateClient();
    }

    public class StsFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["CloudFront:OriginSecret"] = "test-secret"
                });
            });
            builder.ConfigureServices(services =>
            {
                services.AddSingleton<IAwsCredentialProvider>(
                    new StubAwsCredentialProvider("test-access-key", "test-secret-key", "fake-session-token"));
            });
        }

        protected override void ConfigureClient(HttpClient client)
        {
            base.ConfigureClient(client);
            client.DefaultRequestHeaders.Add("X-CloudFront-Secret", "test-secret");
        }
    }

    [Fact]
    public async Task Get_UploadUrls_WithStsCredentials_ResponseIncludesSecurityToken()
    {
        var jobId = Guid.NewGuid();
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/jobs/{jobId}/upload-urls");

        request.Headers.Add("X-Session-ID", Guid.NewGuid().ToString());

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        var videoFields = json.GetProperty("videoUpload").GetProperty("fields");
        var overlayFields = json.GetProperty("overlayUpload").GetProperty("fields");

        Assert.True(videoFields.TryGetProperty("xAmzSecurityToken", out var videoToken));
        Assert.False(string.IsNullOrWhiteSpace(videoToken.GetString()));

        Assert.True(overlayFields.TryGetProperty("xAmzSecurityToken", out var overlayToken));
        Assert.False(string.IsNullOrWhiteSpace(overlayToken.GetString()));
    }
}