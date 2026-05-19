using Overlayer.Worker.Configuration;

namespace Overlayer.Worker.Ffmpeg;

public class FfmpegCommandBuilder : IFfmpegCommandBuilder
{
    private readonly FfmpegOptions _options;
    public FfmpegCommandBuilder(FfmpegOptions options)
    {
        _options = options;
    }
    public static FfmpegCommandBuilder WithDefaults() =>
        new(new FfmpegOptions());

    public string Build(string videoPath, string overlayPath, string outputPath)
    {
        return $"-y -i \"{videoPath}\" -i \"{overlayPath}\" -filter_complex \"[0:v][1:v]overlay=0:0\" -c:v libx264 -crf 20 -minrate {_options.MinBitrate}k -maxrate {_options.MaxBitrate}k -bufsize {_options.MaxBitrate * 2}k -c:a copy \"{outputPath}\"";
    }
}