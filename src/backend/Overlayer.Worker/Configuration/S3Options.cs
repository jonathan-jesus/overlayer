namespace Overlayer.Worker.Configuration;

public class S3Options
{
    public const string SectionName = "S3";

    public string BucketName { get; set; } = string.Empty;
}
