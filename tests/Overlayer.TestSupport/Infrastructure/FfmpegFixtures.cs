namespace Overlayer.TestSupport.Infrastructure;

public static class FfmpegFixtures
{
    private static readonly System.Reflection.Assembly Assembly =
        typeof(FfmpegFixtures).Assembly;

    public static Stream VideoStream()
    {
        const string resourceName = "Overlayer.TestSupport.Fixtures.1s-16x16.mp4";
        return Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException(
                $"Embedded resource '{resourceName}' not found. " +
                "Generate it with: ffmpeg -f lavfi -i testsrc=duration=1:size=16x16:rate=1 -c:v libx264 -t 1 1s-16x16.mp4 " +
                "and place it at tests/Overlayer.TestSupport/Fixtures/1s-16x16.mp4");
    }

    public static Stream OverlayStream()
    {
        const string resourceName = "Overlayer.TestSupport.Fixtures.16x16.png";
        return Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException(
                $"Embedded resource '{resourceName}' not found. " +
                "Place a 16×16 PNG at tests/Overlayer.TestSupport/Fixtures/16x16.png");
    }

    public static Stream EmptyVideoStream()
    {
        const string resourceName = "Overlayer.TestSupport.Fixtures.empty.mp4";
        return Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Embedded resource '{resourceName}' not found.");
    }
}
