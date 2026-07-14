using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Overlayer.Api.Services;
using Overlayer.TestSupport.Assertions;

namespace Overlayer.Api.Tests.Acceptance;

public class RequestUploadUrlsTests : IClassFixture<RequestUploadUrlsTests.NoStsFactory>
{
    private readonly HttpClient _client;

    public class NoStsFactory : WebApplicationFactory<Program>
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
                    new StubAwsCredentialProvider("test-access-key", "test-secret-key", null));
            });
        }

        protected override void ConfigureClient(HttpClient client)
        {
            base.ConfigureClient(client);
            client.DefaultRequestHeaders.Add("X-CloudFront-Secret", "test-secret");
        }
    }

    public RequestUploadUrlsTests(NoStsFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Get_UploadUrls_WithValidRequest_Returns200AndBasicShape()
    {
        var jobId = Guid.NewGuid();
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/jobs/{jobId}/upload-urls");

        request.Headers.Add("X-Session-ID", Guid.NewGuid().ToString());

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(json.TryGetProperty("jobId", out _));
        Assert.True(json.TryGetProperty("videoUpload", out _));
        Assert.True(json.TryGetProperty("overlayUpload", out _));
    }

    [Fact]
    public async Task Get_UploadUrls_WithoutSessionId_Returns400()
    {
        var jobId = Guid.NewGuid();
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/jobs/{jobId}/upload-urls");

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_UploadUrls_WithInvalidSessionId_Returns400()
    {
        var jobId = Guid.NewGuid();
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/jobs/{jobId}/upload-urls");

        request.Headers.Add("X-Session-ID", "invalid-guid");

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_UploadUrls_WithInvalidJobId_Returns400()
    {
        var jobId = "invalid-guid";
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/jobs/{jobId}/upload-urls");

        request.Headers.Add("X-Session-ID", Guid.NewGuid().ToString());

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_UploadUrls_WithoutStsCredentials_ResponseDoesNotIncludeSecurityToken()
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

        Assert.False(videoFields.TryGetProperty("xAmzSecurityToken", out _));
        Assert.False(overlayFields.TryGetProperty("xAmzSecurityToken", out _));
    }

    [Fact]
    public async Task Get_UploadUrls_ReturnsContractCompliantResponse()
    {
        var jobId = Guid.NewGuid();
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/jobs/{jobId}/upload-urls");

        request.Headers.Add("X-Session-ID", Guid.NewGuid().ToString());

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();

        json.ShouldMatchSchema("upload-urls.schema.json");
    }
}
