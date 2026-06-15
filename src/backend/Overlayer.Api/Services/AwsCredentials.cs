namespace Overlayer.Api.Services;

public record AwsCredentials(string AccessKey, string SecretKey, string? SessionToken);
