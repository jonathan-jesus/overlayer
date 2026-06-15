
namespace Overlayer.Api.Services;

public interface IAwsCredentialProvider
{
    Task<AwsCredentials> GetCredentialsAsync();
}