using Overlayer.Api.Services;

namespace Overlayer.Api.Tests;

public class StubAwsCredentialProvider : IAwsCredentialProvider
{
    private readonly AwsCredentials _credentials;

    public StubAwsCredentialProvider(string accessKey, string secretKey, string? sessionToken)
    {
        _credentials = new AwsCredentials(accessKey, secretKey, sessionToken);
    }

    public Task<AwsCredentials> GetCredentialsAsync() => Task.FromResult(_credentials);
}
