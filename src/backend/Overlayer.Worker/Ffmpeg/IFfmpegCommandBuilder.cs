namespace Overlayer.Worker.Ffmpeg;

public interface IFfmpegCommandBuilder
{
    string Build(string videoPath, string overlayPath, string outputPath);
}
