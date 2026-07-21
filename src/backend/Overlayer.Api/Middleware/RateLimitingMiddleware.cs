using Microsoft.Extensions.Options;
using Overlayer.Api.Configuration;
using Overlayer.Api.Services;

namespace Overlayer.Api.Middleware;

public class RateLimitingMiddleware
{
    public RateLimitingMiddleware(
        RequestDelegate next,
        IOptions<RateLimitOptions> options,
        IRateLimitStore store,
        IClientIpResolver ipResolver)
    { }

    public async Task InvokeAsync(HttpContext context)
        => throw new NotImplementedException();

}
