namespace Overlayer.Api.Services;

public class FallbackAwsCredentialProvider : IAwsCredentialProvider
{
    public async Task<AwsCredentials> GetCredentialsAsync()
    => throw new NotImplementedException();
}