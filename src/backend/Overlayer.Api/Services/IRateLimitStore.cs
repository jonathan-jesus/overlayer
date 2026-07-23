namespace Overlayer.Api.Services;

public interface IRateLimitStore
{
    Task<long> IncrementAsync(string key, int windowSeconds);
}
