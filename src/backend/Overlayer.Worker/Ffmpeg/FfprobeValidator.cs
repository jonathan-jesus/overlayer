namespace Overlayer.Worker.Ffmpeg;

public class FfprobeValidator : IMediaValidator
{
    public FfprobeValidator(IProcessRunner processRunner) { }

    public Task<MediaValidationResult> ValidateAsync(string filePath)
    {
        return Task.FromResult(new MediaValidationResult(false, "Invalid video codec."));
    }
}
