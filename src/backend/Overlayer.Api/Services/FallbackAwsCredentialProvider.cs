using Amazon.Runtime;
using Microsoft.Extensions.Options;
using Overlayer.Api.Configuration;

namespace Overlayer.Api.Services;

public class FallbackAwsCredentialProvider : IAwsCredentialProvider
{
    private readonly S3Options _options;

    public FallbackAwsCredentialProvider(IOptions<S3Options> options)
        => _options = options.Value;

    public async Task<AwsCredentials> GetCredentialsAsync()
    {
        if (!string.IsNullOrWhiteSpace(_options.AccessKey) &&
            !string.IsNullOrWhiteSpace(_options.SecretKey))
            return new AwsCredentials(_options.AccessKey, _options.SecretKey, null);

#pragma warning disable CS0618
        var awsCredentials = FallbackCredentialsFactory.GetCredentials();
#pragma warning restore CS0618
        var creds = await awsCredentials.GetCredentialsAsync();
        return new AwsCredentials(creds.AccessKey, creds.SecretKey, creds.Token);
    }
}