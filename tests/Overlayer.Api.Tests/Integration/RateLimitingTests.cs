using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Overlayer.Api.Configuration;
using Overlayer.TestSupport.Infrastructure;

namespace Overlayer.Api.Tests.Integration;

public class RateLimitingTests : IClassFixture<LocalStackFixture>
{
    private const string BucketName = "overlayer-rate-limit-integration";
    private const string RateLimitTableName = "overlayer-rate-limits-test";

    private const int UploadUrlsSessionLimit = 5;
    private const int UploadUrlsIpLimit = 20;
    private const int JobsSessionLimit = 30;
    private const int ShortWindowSeconds = 1;
    private const int SmallJobsIpLimit = 5;

    private readonly LocalStackFixture _localStack;

    public RateLimitingTests(LocalStackFixture localStack)
    {
        _localStack = localStack;
    }

    private static RateLimitOptions DefaultRateLimitOptions => new()
    {
        WindowSeconds = 60,
        UploadUrls = new() { SessionLimit = UploadUrlsSessionLimit, IpLimit = UploadUrlsIpLimit },
        Jobs = new() { SessionLimit = JobsSessionLimit }
    };

    private class TestFactory : Infrastructure.BaseIntegrationApiFactory
    {
        public TestFactory(string connectionString, string bucketName, string dynamoDbConnectionString)
            : base(connectionString, bucketName, dynamoDbConnectionString,
                   rateLimitOptions: DefaultRateLimitOptions)
        { }
    }

    private class ShortWindowTestFactory : Infrastructure.BaseIntegrationApiFactory
    {
        public ShortWindowTestFactory(string connectionString, string bucketName, string dynamoDbConnectionString)
            : base(connectionString, bucketName, dynamoDbConnectionString,
                   rateLimitOptions: DefaultRateLimitOptions with { WindowSeconds = ShortWindowSeconds })
        { }
    }

    private class SmallIpLimitJobsTestFactory : Infrastructure.BaseIntegrationApiFactory
    {
        public SmallIpLimitJobsTestFactory(string connectionString, string bucketName, string dynamoDbConnectionString)
            : base(connectionString, bucketName, dynamoDbConnectionString,
                   rateLimitOptions: DefaultRateLimitOptions with
                   {
                       Jobs = new() { SessionLimit = JobsSessionLimit, IpLimit = SmallJobsIpLimit }
                   })
        { }
    }

    private WebApplicationFactory<Program> CreateFactory() =>
        new TestFactory(_localStack.ConnectionString, BucketName, _localStack.ConnectionString);

    private WebApplicationFactory<Program> CreateShortWindowFactory() =>
        new ShortWindowTestFactory(_localStack.ConnectionString, BucketName, _localStack.ConnectionString);

    private WebApplicationFactory<Program> CreateSmallIpLimitJobsFactory() =>
        new SmallIpLimitJobsTestFactory(_localStack.ConnectionString, BucketName, _localStack.ConnectionString);

    [Fact]
    public async Task UploadUrls_SameSession_ExceedingSessionLimit_Returns429()
    {
        var sessionId = Guid.NewGuid().ToString();

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        for (var i = 1; i <= UploadUrlsSessionLimit; i++)
        {
            var response = await client.SendAsync(BuildUploadUrlsRequest(sessionId, ip: "10.0.0.1"));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var blockedResponse = await client.SendAsync(BuildUploadUrlsRequest(sessionId, ip: "10.0.0.1"));

        Assert.Equal(HttpStatusCode.TooManyRequests, blockedResponse.StatusCode);
        Assert.True(blockedResponse.Headers.Contains("Retry-After"));
    }

    [Fact]
    public async Task UploadUrls_SameIp_AcrossMultipleSessions_ExceedingIpLimit_Returns429()
    {
        const string sharedIp = "10.1.0.1";

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        for (var i = 1; i <= UploadUrlsIpLimit; i++)
        {
            var response = await client.SendAsync(BuildUploadUrlsRequest(Guid.NewGuid().ToString(), ip: sharedIp));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var blockedResponse = await client.SendAsync(BuildUploadUrlsRequest(Guid.NewGuid().ToString(), ip: sharedIp));

        Assert.Equal(HttpStatusCode.TooManyRequests, blockedResponse.StatusCode);
        Assert.True(blockedResponse.Headers.Contains("Retry-After"));
    }

    [Fact]
    public async Task UploadUrls_DifferentSessions_DifferentIps_EachWithinLimit_Returns200()
    {
        var sessionA = Guid.NewGuid().ToString();
        var sessionB = Guid.NewGuid().ToString();

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        for (var i = 0; i < UploadUrlsSessionLimit; i++)
        {
            var responseA = await client.SendAsync(BuildUploadUrlsRequest(sessionA, ip: "10.2.0.1"));
            Assert.Equal(HttpStatusCode.OK, responseA.StatusCode);

            var responseB = await client.SendAsync(BuildUploadUrlsRequest(sessionB, ip: "10.2.0.2"));
            Assert.Equal(HttpStatusCode.OK, responseB.StatusCode);
        }
    }

    [Fact]
    public async Task Jobs_SameSession_ExceedingSessionLimit_Returns429()
    {
        var sessionId = Guid.NewGuid().ToString();
        await _localStack.CreateBucketAsync(BucketName);

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        for (var i = 1; i <= JobsSessionLimit; i++)
        {
            var response = await client.SendAsync(BuildJobsRequest(sessionId, ip: "10.3.0.1"));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var blockedResponse = await client.SendAsync(BuildJobsRequest(sessionId, ip: "10.3.0.1"));

        Assert.Equal(HttpStatusCode.TooManyRequests, blockedResponse.StatusCode);
        Assert.True(blockedResponse.Headers.Contains("Retry-After"));
    }

    [Fact]
    public async Task Jobs_DifferentSessions_EachWithinLimit_Returns200()
    {
        var sessionA = Guid.NewGuid().ToString();
        var sessionB = Guid.NewGuid().ToString();
        await _localStack.CreateBucketAsync(BucketName);

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        for (var i = 0; i < JobsSessionLimit; i++)
        {
            var responseA = await client.SendAsync(BuildJobsRequest(sessionA, ip: "10.4.0.1"));
            Assert.Equal(HttpStatusCode.OK, responseA.StatusCode);

            var responseB = await client.SendAsync(BuildJobsRequest(sessionB, ip: "10.4.0.2"));
            Assert.Equal(HttpStatusCode.OK, responseB.StatusCode);
        }
    }

    [Fact]
    public async Task UploadUrls_AfterCounterExpiry_Returns200Again()
    {
        var sessionId = Guid.NewGuid().ToString();

        using var factory = CreateShortWindowFactory();
        using var client = factory.CreateClient();

        for (var i = 1; i <= UploadUrlsSessionLimit; i++)
        {
            var response = await client.SendAsync(BuildUploadUrlsRequest(sessionId, ip: "10.5.0.1"));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var blockedResponse = await client.SendAsync(BuildUploadUrlsRequest(sessionId, ip: "10.5.0.1"));
        Assert.Equal(HttpStatusCode.TooManyRequests, blockedResponse.StatusCode);

        // Timing tolerance
        await Task.Delay(TimeSpan.FromSeconds(ShortWindowSeconds + 1));

        var recoveredResponse = await client.SendAsync(BuildUploadUrlsRequest(sessionId, ip: "10.5.0.1"));
        Assert.Equal(HttpStatusCode.OK, recoveredResponse.StatusCode);
    }

    [Fact]
    public async Task Jobs_SameIp_AcrossMultipleSessions_ExceedingIpLimit_Returns429()
    {
        const string sharedIp = "10.6.0.1";
        await _localStack.CreateBucketAsync(BucketName);

        using var factory = CreateSmallIpLimitJobsFactory();
        using var client = factory.CreateClient();

        for (var i = 1; i <= SmallJobsIpLimit; i++)
        {
            var response = await client.SendAsync(BuildJobsRequest(Guid.NewGuid().ToString(), ip: sharedIp));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var blockedResponse = await client.SendAsync(BuildJobsRequest(Guid.NewGuid().ToString(), ip: sharedIp));

        Assert.Equal(HttpStatusCode.TooManyRequests, blockedResponse.StatusCode);
        Assert.True(blockedResponse.Headers.Contains("Retry-After"));
    }

    [Fact]
    public async Task Jobs_DifferentIps_EachWithinIpLimit_Returns200()
    {
        await _localStack.CreateBucketAsync(BucketName);

        using var factory = CreateSmallIpLimitJobsFactory();
        using var client = factory.CreateClient();

        for (var i = 0; i < SmallJobsIpLimit; i++)
        {
            var responseA = await client.SendAsync(BuildJobsRequest(Guid.NewGuid().ToString(), ip: "10.7.0.1"));
            Assert.Equal(HttpStatusCode.OK, responseA.StatusCode);

            var responseB = await client.SendAsync(BuildJobsRequest(Guid.NewGuid().ToString(), ip: "10.7.0.2"));
            Assert.Equal(HttpStatusCode.OK, responseB.StatusCode);
        }
    }

    [Fact]
    public async Task IncrementAsync_WrittenItem_HasExpiresAtEqualToWindowEnd()
    {
        var sessionId = Guid.NewGuid().ToString();

        using var factory = CreateShortWindowFactory();
        using var client = factory.CreateClient();

        var before = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var apiResponse = await client.SendAsync(BuildUploadUrlsRequest(sessionId, ip: "10.8.0.1"));
        Assert.Equal(HttpStatusCode.OK, apiResponse.StatusCode);

        var windowStart = before - (before % ShortWindowSeconds);
        var expectedExpiresAt = windowStart + ShortWindowSeconds;

        using var dynamo = _localStack.GetDynamoDbClient();
        var itemKey = $"session:{sessionId}:upload-urls#{windowStart}";

        var response = await dynamo.GetItemAsync(new Amazon.DynamoDBv2.Model.GetItemRequest
        {
            TableName = RateLimitTableName,
            Key = new Dictionary<string, Amazon.DynamoDBv2.Model.AttributeValue>
            {
                ["Id"] = new Amazon.DynamoDBv2.Model.AttributeValue { S = itemKey }
            }
        });

        Assert.True(response.IsItemSet, $"Item with key {itemKey} was not found in DynamoDB");
        Assert.True(response.Item.ContainsKey("ExpiresAt"), "ExpiresAt attribute is missing from the item");
        var actualExpiresAt = long.Parse(response.Item["ExpiresAt"].N);
        // Timing tolerance
        Assert.InRange(actualExpiresAt, expectedExpiresAt, expectedExpiresAt + 1);
    }

    private static HttpRequestMessage BuildUploadUrlsRequest(string sessionId, string ip)
    {
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/jobs/{Guid.NewGuid()}/upload-urls");

        request.Headers.Add("X-Session-ID", sessionId);
        request.Headers.Add("X-Forwarded-For", ip);

        return request;
    }

    private static HttpRequestMessage BuildJobsRequest(string sessionId, string ip)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/jobs");

        request.Headers.Add("X-Session-ID", sessionId);
        request.Headers.Add("X-Forwarded-For", ip);

        return request;
    }
}
