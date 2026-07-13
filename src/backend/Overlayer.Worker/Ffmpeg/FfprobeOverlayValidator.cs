using System.Text.Json;

namespace Overlayer.Worker.Ffmpeg;

public class FfprobeOverlayValidator : IOverlayValidator
{
    private readonly IProcessRunner _processRunner;

    public FfprobeOverlayValidator(IProcessRunner processRunner)
    {
        _processRunner = processRunner;
    }

    public async Task<MediaValidationResult> ValidateAsync(string filePath)
    {
        var arguments = $"-v quiet -print_format json -show_streams -select_streams v:0 \"{filePath}\"";
        var result = await _processRunner.RunAsync("ffprobe", arguments);

        if (result.ExitCode != 0)
            return MediaValidationResult.Fail("The overlay file provided is invalid");

        try
        {
            using var doc = JsonDocument.Parse(result.StandardOutput);
            var streams = doc.RootElement.GetProperty("streams");

            if (streams.GetArrayLength() == 0)
                return MediaValidationResult.Fail("No image stream found in file");

            var stream = streams[0];
            var codec = stream.GetProperty("codec_name").GetString();
            if (codec != "png")
                return MediaValidationResult.Fail($"Image codec must be png, got: {codec}");

            return MediaValidationResult.Valid();
        }
        catch (JsonException)
        {
            return MediaValidationResult.Fail("Unable to read overlay image properties. The file might be corrupted or in an unsupported format.");
        }
    }
}