namespace Overlayer.Api.Services;

public interface IAwsCredentialProvider
{
    Task<AwsCredentials> GetCredentialsAsync();
}

public record AwsCredentials(string AccessKey, string SecretKey, string? SessionToken);
