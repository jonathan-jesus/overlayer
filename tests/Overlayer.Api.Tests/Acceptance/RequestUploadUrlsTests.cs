using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Overlayer.Api.Tests.Acceptance;

public class RequestUploadUrlsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public RequestUploadUrlsTests(WebApplicationFactory<Program> factory)
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
}
