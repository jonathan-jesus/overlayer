namespace Overlayer.Worker.Configuration;

public class FfmpegOptions
{
    public const string SectionName = "Ffmpeg";
    public int MinBitrate { get; set; } = 3000;
    public int MaxBitrate { get; set; } = 6500;
}