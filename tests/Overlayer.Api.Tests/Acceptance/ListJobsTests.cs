using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Overlayer.Api.Tests.Acceptance;

public class ListJobsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public ListJobsTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Get_Jobs_WithoutSessionId_Returns400()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/jobs");

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_Jobs_WithInvalidSessionId_Returns400()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/jobs");
        request.Headers.Add("X-Session-ID", "invalid-guid");

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
