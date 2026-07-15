using Overlayer.Api.Services;

namespace Overlayer.Api.Tests;

public class StubRateLimitStore : IRateLimitStore
{
    public Task<long> IncrementAsync(string key, int windowSeconds) => Task.FromResult(0L);
}
