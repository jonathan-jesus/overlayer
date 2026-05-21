using System.Text.Json;

namespace Overlayer.Worker.Ffmpeg;

public class FfprobeValidator : IMediaValidator
{
    private readonly IProcessRunner _processRunner;
    public FfprobeValidator(IProcessRunner processRunner)
    {
        _processRunner = processRunner;
    }

    public async Task<MediaValidationResult> ValidateAsync(string videoPath)
    {
        var arguments = $"-v quiet -print_format json -show_streams -select_streams v:0 \"{videoPath}\"";
        var result = await _processRunner.RunAsync("ffprobe", arguments);

        if (result.ExitCode != 0)
            return MediaValidationResult.Fail($"ffprobe failed with exit code {result.ExitCode}");

        try
        {
            using var doc = JsonDocument.Parse(result.StandardOutput);
            var streams = doc.RootElement.GetProperty("streams");

            if (streams.GetArrayLength() == 0)
                return MediaValidationResult.Fail("No video stream found in file");

            var stream = streams[0];

            var codec = stream.GetProperty("codec_name").GetString();
            if (codec != "h264")
                return MediaValidationResult.Fail($"Video codec must be H.264, got: {codec}");

            var width = stream.GetProperty("width").GetInt32();
            var height = stream.GetProperty("height").GetInt32();

            var maxDimension = Math.Max(width, height);
            var minDimension = Math.Min(width, height);

            if (maxDimension > 1920 || minDimension > 1080)
                return MediaValidationResult.Fail(
                    $"Video exceeds maximum allowed dimensions (1920\u00d71080), got: {width}\u00d7{height}");

            return MediaValidationResult.Valid();
        }
        catch (JsonException)
        {
            return MediaValidationResult.Fail("Invalid JSON output from ffprobe");
        }
    }
}
