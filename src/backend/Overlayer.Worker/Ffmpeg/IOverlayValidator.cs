namespace Overlayer.Worker.Ffmpeg;

public interface IOverlayValidator
{
    Task<MediaValidationResult> ValidateAsync(string filePath);
}
