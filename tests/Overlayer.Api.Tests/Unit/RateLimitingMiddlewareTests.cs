using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Overlayer.Api.Configuration;
using Overlayer.Api.Middleware;
using Overlayer.Api.Services;

namespace Overlayer.Api.Tests.Unit;

public class RateLimitingMiddlewareTests
{
    private readonly IRateLimitStore _store = Substitute.For<IRateLimitStore>();
    private readonly IClientIpResolver _ipResolver = Substitute.For<IClientIpResolver>();
    private bool _nextWasCalled;

    private const string TestIp = "10.0.0.1";
    private const string UploadUrlsPath = "/api/jobs/test-job/upload-urls";
    private const string JobsPath = "/api/jobs";
    private const int UploadUrlsSessionLimit = 5;
    private const int UploadUrlsIpLimit = 20;
    private const int WindowSeconds = 60;

    private RateLimitingMiddleware CreateSut()
    {
        _nextWasCalled = false;
        RequestDelegate next = _ =>
        {
            _nextWasCalled = true;
            return Task.CompletedTask;
        };
        var options = Options.Create(new RateLimitOptions());
        return new RateLimitingMiddleware(next, options, _store, _ipResolver);
    }

    private static HttpContext BuildContext(string path, string? sessionId = "test-session")
    {
        var context = new DefaultHttpContext();

        if (sessionId is not null)
            context.Request.Headers["X-Session-ID"] = sessionId;

        var policyName = path.Contains("upload-urls") ? "upload-urls" : "jobs";
        var endpoint = new Endpoint(
            null,
            new EndpointMetadataCollection(new RequireRateLimitAttribute(policyName)),
            null);

        context.SetEndpoint(endpoint);
        return context;
    }

    [Fact]
    public async Task InvokeAsync_BelowBothLimits_CallsNext()
    {
        _ipResolver.Resolve(Arg.Any<HttpContext>()).Returns(TestIp);
        _store.IncrementAsync(Arg.Any<string>(), WindowSeconds).Returns(Task.FromResult(1L));

        var context = BuildContext(UploadUrlsPath);

        await CreateSut().InvokeAsync(context);

        Assert.True(_nextWasCalled);
        await _store.Received(2).IncrementAsync(Arg.Any<string>(), WindowSeconds);
    }

    [Fact]
    public async Task InvokeAsync_SessionCountExceedsLimit_Returns429WithRetryAfter()
    {
        _ipResolver.Resolve(Arg.Any<HttpContext>()).Returns(TestIp);
        _store.IncrementAsync(Arg.Is<string>(k => k.StartsWith("session:")), WindowSeconds)
              .Returns(Task.FromResult((long)(UploadUrlsSessionLimit + 1)));
        _store.IncrementAsync(Arg.Is<string>(k => k.StartsWith("ip:")), WindowSeconds)
              .Returns(Task.FromResult(1L));

        var context = BuildContext(UploadUrlsPath);

        await CreateSut().InvokeAsync(context);

        Assert.Equal(StatusCodes.Status429TooManyRequests, context.Response.StatusCode);
        Assert.True(context.Response.Headers.ContainsKey("Retry-After"));
        Assert.False(_nextWasCalled);
    }

    [Fact]
    public async Task InvokeAsync_IpCountExceedsLimit_Returns429WithRetryAfter()
    {
        _ipResolver.Resolve(Arg.Any<HttpContext>()).Returns(TestIp);
        _store.IncrementAsync(Arg.Is<string>(k => k.StartsWith("session:")), WindowSeconds)
              .Returns(Task.FromResult(1L));
        _store.IncrementAsync(Arg.Is<string>(k => k.StartsWith("ip:")), WindowSeconds)
              .Returns(Task.FromResult((long)(UploadUrlsIpLimit + 1)));

        var context = BuildContext(UploadUrlsPath);

        await CreateSut().InvokeAsync(context);

        Assert.Equal(StatusCodes.Status429TooManyRequests, context.Response.StatusCode);
        Assert.True(context.Response.Headers.ContainsKey("Retry-After"));
        Assert.False(_nextWasCalled);
    }

    [Fact]
    public async Task InvokeAsync_SessionAndIpBothAtLimit_Returns429()
    {
        _ipResolver.Resolve(Arg.Any<HttpContext>()).Returns(TestIp);
        _store.IncrementAsync(Arg.Is<string>(k => k.StartsWith("session:")), WindowSeconds)
              .Returns(Task.FromResult((long)(UploadUrlsSessionLimit + 1)));
        _store.IncrementAsync(Arg.Is<string>(k => k.StartsWith("ip:")), WindowSeconds)
              .Returns(Task.FromResult((long)(UploadUrlsIpLimit + 1)));

        var context = BuildContext(UploadUrlsPath);

        await CreateSut().InvokeAsync(context);

        Assert.Equal(StatusCodes.Status429TooManyRequests, context.Response.StatusCode);
        Assert.False(_nextWasCalled);
    }

    [Fact]
    public async Task InvokeAsync_MissingSessionId_SkipsMiddleware_CallsNext()
    {
        var context = BuildContext(UploadUrlsPath, sessionId: null);

        await CreateSut().InvokeAsync(context);

        Assert.True(_nextWasCalled);
        await _store.DidNotReceive().IncrementAsync(Arg.Any<string>(), Arg.Any<int>());
    }

    [Fact]
    public async Task InvokeAsync_UploadUrlsEndpoint_UsesUploadLimits()
    {
        _ipResolver.Resolve(Arg.Any<HttpContext>()).Returns(TestIp);
        _store.IncrementAsync(Arg.Is<string>(k => k.StartsWith("session:")), WindowSeconds)
              .Returns(Task.FromResult((long)(UploadUrlsSessionLimit + 1)));
        _store.IncrementAsync(Arg.Is<string>(k => k.StartsWith("ip:")), WindowSeconds)
              .Returns(Task.FromResult(1L));

        var context = BuildContext(UploadUrlsPath);

        await CreateSut().InvokeAsync(context);

        Assert.Equal(StatusCodes.Status429TooManyRequests, context.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_JobsEndpoint_UsesJobsLimits()
    {
        _ipResolver.Resolve(Arg.Any<HttpContext>()).Returns(TestIp);

        _store.IncrementAsync(Arg.Any<string>(), WindowSeconds)
              .Returns(Task.FromResult((long)(UploadUrlsSessionLimit + 1)));

        var context = BuildContext(JobsPath);

        await CreateSut().InvokeAsync(context);

        Assert.True(_nextWasCalled);
        await _store.Received(2).IncrementAsync(Arg.Any<string>(), WindowSeconds);
    }

    [Fact]
    public async Task InvokeAsync_StoreThrows_PropagatesException()
    {
        _ipResolver.Resolve(Arg.Any<HttpContext>()).Returns(TestIp);
        _store.IncrementAsync(Arg.Any<string>(), Arg.Any<int>())
              .Throws(new InvalidOperationException("DynamoDB unavailable"));

        var context = BuildContext(UploadUrlsPath);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateSut().InvokeAsync(context));
    }
}
