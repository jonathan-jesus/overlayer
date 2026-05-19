namespace Overlayer.Worker.Ffmpeg;

public class FfmpegCommandBuilder : IFfmpegCommandBuilder
{
    public string Build(string videoPath, string overlayPath, string outputPath)
    {
        return $"-y -i \"{videoPath}\" -i \"{overlayPath}\" -filter_complex \"[0:v][1:v]overlay=0:0\" -c:v libx264 \"{outputPath}\"";
    }
}
