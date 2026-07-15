namespace Overlayer.Api.Configuration;

public class DynamoDbOptions
{
    public const string SectionName = "DynamoDB";

    public string ServiceUrl { get; set; } = string.Empty;
    public string Region { get; set; } = "us-east-2";
    public string AccessKey { get; set; } = string.Empty;
    public string SecretKey { get; set; } = string.Empty;
}
