namespace Overlayer.Worker.Ffmpeg;

public class FfprobeOverlayValidator : IOverlayValidator
{
    public Task<MediaValidationResult> ValidateAsync(string filePath)
    => throw new NotImplementedException();
}