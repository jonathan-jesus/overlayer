using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Overlayer.TestSupport.Assertions;
using Overlayer.TestSupport.Infrastructure;

namespace Overlayer.Api.Tests.Integration;

public class ListJobsTests : IClassFixture<LocalStackFixture>
{
    private const string BucketName = "overlayer-integration-test";

    private readonly LocalStackFixture _localStack;

    public ListJobsTests(LocalStackFixture localStack)
    {
        _localStack = localStack;
    }

    private class TestFactory : Infrastructure.BaseIntegrationApiFactory
    {
        public TestFactory(string connectionString, string bucketName)
            : base(connectionString, bucketName) { }
    }

    private WebApplicationFactory<Program> CreateFactory() => new TestFactory(_localStack.ConnectionString, BucketName);


    [Fact]
    public async Task Get_Jobs_WithSingleInputFileJobInS3_ReturnsMissingAssetsStatus()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _localStack.CreateBucketAsync(BucketName);
        await _localStack.UploadObjectAsync(
            BucketName,
            $"jobs/{sessionId}/{jobId}/video.mp4",
            new MemoryStream("fake-video"u8.ToArray()));

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/jobs");
        request.Headers.Add("X-Session-ID", sessionId);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(body).RootElement;

        var jobs = json.GetProperty("jobs");
        Assert.Equal(JsonValueKind.Array, jobs.ValueKind);

        var job = Assert.Single(jobs.EnumerateArray());
        Assert.Equal(jobId, job.GetProperty("jobId").GetString());
        Assert.Equal("MISSING_ASSETS", job.GetProperty("status").GetString());
        body.ShouldMatchSchema("list-jobs.schema.json");
    }

    [Fact]
    public async Task Get_Jobs_WithProcessingJobInS3_ReturnsProcessingStatus()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _localStack.CreateBucketAsync(BucketName);
        await _localStack.UploadObjectAsync(
            BucketName,
            $"jobs/{sessionId}/{jobId}/video.mp4",
            new MemoryStream("fake-video"u8.ToArray()));
        await _localStack.UploadObjectAsync(
            BucketName,
            $"jobs/{sessionId}/{jobId}/overlay.png",
            new MemoryStream("fake-overlay"u8.ToArray()));

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/jobs");
        request.Headers.Add("X-Session-ID", sessionId);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(body).RootElement;

        var jobs = json.GetProperty("jobs");
        Assert.Equal(JsonValueKind.Array, jobs.ValueKind);

        var job = Assert.Single(jobs.EnumerateArray());
        Assert.Equal(jobId, job.GetProperty("jobId").GetString());
        Assert.Equal("PROCESSING", job.GetProperty("status").GetString());
        body.ShouldMatchSchema("list-jobs.schema.json");
    }

    [Fact]
    public async Task Get_Jobs_WithCompletedJobInS3_ReturnsCompletedStatus()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        await _localStack.CreateBucketAsync(BucketName);
        await _localStack.UploadObjectAsync(
            BucketName,
            $"outputs/{sessionId}/{jobId}/output.mp4",
            new MemoryStream("fake-output"u8.ToArray()));

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/jobs");
        request.Headers.Add("X-Session-ID", sessionId);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(body).RootElement;

        var jobs = json.GetProperty("jobs");
        Assert.Equal(JsonValueKind.Array, jobs.ValueKind);

        var job = Assert.Single(jobs.EnumerateArray());
        Assert.Equal(jobId, job.GetProperty("jobId").GetString());
        Assert.Equal("COMPLETED", job.GetProperty("status").GetString());
        Assert.NotNull(job.GetProperty("downloadUrl").GetString());
        body.ShouldMatchSchema("list-jobs.schema.json");
    }

    [Fact]
    public async Task Get_Jobs_WithFailedJobInS3_ReturnsFailedStatus()
    {
        var sessionId = Guid.NewGuid().ToString();
        var jobId = Guid.NewGuid().ToString();

        var tombstone = """{"reason":"Video format not supported","stage":"process","timestamp":"2026-05-25T08:00:00Z"}""";

        await _localStack.CreateBucketAsync(BucketName);
        await _localStack.UploadObjectAsync(
            BucketName,
            $"outputs/{sessionId}/{jobId}/error.json",
            new MemoryStream(Encoding.UTF8.GetBytes(tombstone)));

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/jobs");
        request.Headers.Add("X-Session-ID", sessionId);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(body).RootElement;

        var jobs = json.GetProperty("jobs");
        Assert.Equal(JsonValueKind.Array, jobs.ValueKind);

        var job = Assert.Single(jobs.EnumerateArray());
        Assert.Equal(jobId, job.GetProperty("jobId").GetString());
        Assert.Equal("FAILED", job.GetProperty("status").GetString());
        Assert.Equal("Video format not supported", job.GetProperty("reason").GetString());
        Assert.True(
            job.GetProperty("downloadUrl").ValueKind == JsonValueKind.Null,
            "downloadUrl must be null for a FAILED job");
        body.ShouldMatchSchema("list-jobs.schema.json");
    }
}