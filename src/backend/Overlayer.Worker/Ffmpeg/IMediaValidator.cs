namespace Overlayer.Worker.Ffmpeg;

public interface IMediaValidator
{
    Task<MediaValidationResult> ValidateAsync(string filePath);
}
