namespace Overlayer.Api.Configuration;

public class UploadOptions
{
    public const string SectionName = "Uploads";

    public long VideoMaxFileSizeBytes { get; set; } = 10 * 1024 * 1024;
    public long OverlayMaxFileSizeBytes { get; set; } = 4 * 1024 * 1024;
}
