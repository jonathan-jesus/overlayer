using Microsoft.Extensions.Options;
using Overlayer.Api.Configuration;
using Overlayer.Api.Services;

namespace Overlayer.Api.Middleware;

public class RateLimitingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly RateLimitOptions _options;
    private readonly IRateLimitStore _store;
    private readonly IClientIpResolver _ipResolver;

    public RateLimitingMiddleware(
        RequestDelegate next,
        IOptions<RateLimitOptions> options,
        IRateLimitStore store,
        IClientIpResolver ipResolver)
    {
        _next = next;
        _options = options.Value;
        _store = store;
        _ipResolver = ipResolver;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var limit = ResolveLimit(context);
        if (limit is null)
        {
            await _next(context);
            return;
        }

        var sessionId = context.Request.Headers["X-Session-ID"].ToString();
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            await _next(context);
            return;
        }

        var (endpointName, sessionLimit, ipLimit) = limit.Value;
        var ip = ipLimit.HasValue ? _ipResolver.Resolve(context) : null;
        var sessionKey = $"session:{sessionId}:{endpointName}";

        var sessionCount = await _store.IncrementAsync(sessionKey, _options.WindowSeconds);

        long ipCount = 0;
        if (ipLimit.HasValue)
        {
            var ipKey = $"ip:{ip}:{endpointName}";
            ipCount = await _store.IncrementAsync(ipKey, _options.WindowSeconds);
        }

        if (sessionCount > sessionLimit || (ipLimit.HasValue && ipCount > ipLimit.Value))
        {
            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            context.Response.Headers["Retry-After"] = _options.WindowSeconds.ToString();
            return;
        }

        await _next(context);
    }

    private (string EndpointName, int SessionLimit, int? IpLimit)? ResolveLimit(HttpContext context)
    {
        var endpoint = context.GetEndpoint();
        var attribute = endpoint?.Metadata.GetMetadata<RequireRateLimitAttribute>();

        if (attribute == null)
            return null;

        return attribute.PolicyName switch
        {
            "upload-urls" => ("upload-urls", _options.UploadUrls.SessionLimit, _options.UploadUrls.IpLimit),
            "jobs" => ("jobs", _options.Jobs.SessionLimit, _options.Jobs.IpLimit),
            _ => null
        };
    }
}
