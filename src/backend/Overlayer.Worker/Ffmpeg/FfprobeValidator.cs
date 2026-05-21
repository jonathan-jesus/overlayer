namespace Overlayer.Worker.Ffmpeg;

public class FfprobeValidator : IMediaValidator
{
    public FfprobeValidator(IProcessRunner processRunner) { }

    public Task<MediaValidationResult> ValidateAsync(string filePath)
        => throw new NotImplementedException();
}
