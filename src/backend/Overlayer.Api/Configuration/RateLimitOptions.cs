namespace Overlayer.Api.Configuration;

public record RateLimitOptions
{
    public const string SectionName = "RateLimit";

    public string TableName { get; set; } = "overlayer-rate-limits";
    public int WindowSeconds { get; set; } = 60;

    public RateLimitRule UploadUrls { get; set; } = new() { SessionLimit = 5, IpLimit = 20 };
    public RateLimitRule Jobs { get; set; } = new() { SessionLimit = 30, IpLimit = 120 };
}

public record RateLimitRule
{
    public int SessionLimit { get; set; }
    public int? IpLimit { get; set; }
}
