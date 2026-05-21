namespace Overlayer.Worker.Ffmpeg;

public record MediaValidationResult(bool IsValid, string? FailureReason = null)
{
    public static MediaValidationResult Valid() => new(true);
    public static MediaValidationResult Fail(string reason) => new(false, reason);
}
