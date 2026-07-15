using System.Net;
using Overlayer.Api.Tests.Infrastructure;
using Overlayer.TestSupport.Assertions;
using Overlayer.TestSupport.Infrastructure;

namespace Overlayer.Api.Tests.Acceptance;

public class ListJobsTests : IClassFixture<LocalStackFixture>, IAsyncLifetime
{
    private const string BucketName = "overlayer-acceptance-test";

    private readonly LocalStackFixture _localStack;
    private readonly HttpClient _client;

    public string SessionId { get; } = Guid.NewGuid().ToString();
    public string JobId { get; } = Guid.NewGuid().ToString();

    private class TestFactory : BaseIntegrationApiFactory
    {
        public TestFactory(string connectionString, string bucketName, string dynamoDbConnectionString)
            : base(connectionString, bucketName, dynamoDbConnectionString) { }
    }
    public ListJobsTests(LocalStackFixture localStack)
    {
        _localStack = localStack;
        var factory = new TestFactory(_localStack.ConnectionString, BucketName, _localStack.ConnectionString);
        _client = factory.CreateClient();
    }

    public async Task InitializeAsync()
    {
        await _localStack.CreateBucketAsync(BucketName);
        await _localStack.UploadObjectAsync(
            BucketName,
            $"outputs/{SessionId}/{JobId}/output.mp4",
            new MemoryStream("fake-output"u8.ToArray()));
    }

    public Task DisposeAsync() => Task.CompletedTask;

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

    [Fact]
    public async Task Get_Jobs_ReturnsContractCompliantResponse()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/jobs");
        request.Headers.Add("X-Session-ID", SessionId);

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();

        json.ShouldMatchSchema("list-jobs.schema.json");
    }
}
