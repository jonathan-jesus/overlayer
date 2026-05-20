using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using Overlayer.Worker.Ffmpeg;
using Overlayer.Worker.Configuration;

namespace Overlayer.Worker.Processing;

public class JobProcessor : IJobProcessor
{
    private readonly IAmazonS3 _s3;
    private readonly string _bucketName;
    private readonly IProcessRunner _processRunner;
    private readonly IFfmpegCommandBuilder _commandBuilder;
    private readonly IOutputUploader _uploader;
    public JobProcessor(IAmazonS3 s3, S3Options options, IProcessRunner processRunner, IFfmpegCommandBuilder commandBuilder, IOutputUploader uploader)
    {
        _uploader = uploader;
        _commandBuilder = commandBuilder;
        _processRunner = processRunner;
        _bucketName = options.BucketName;
        _s3 = s3;
    }
    public async Task HandleAsync(string sessionId, string jobId)
    {
        var videoKey = $"jobs/{sessionId}/{jobId}/video.mp4";
        var overlayKey = $"jobs/{sessionId}/{jobId}/overlay.png";
        var outputKey = $"outputs/{sessionId}/{jobId}/output.mp4";

        if (await OutputExistsAsync(outputKey))
            return;

        if (!await BothInputsExistAsync(videoKey, overlayKey))
            return;

        var tempDir = Path.Combine(Path.GetTempPath(), "overlayer", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        var videoPath = Path.Combine(tempDir, "video.mp4");
        var overlayPath = Path.Combine(tempDir, "overlay.png");
        var outputPath = Path.Combine(tempDir, "output.mp4");

        try
        {
            var videoResponse = await _s3.GetObjectAsync(new GetObjectRequest { BucketName = _bucketName, Key = videoKey });
            await using (var fs = File.Create(videoPath))
                await videoResponse.ResponseStream.CopyToAsync(fs);

            var overlayResponse = await _s3.GetObjectAsync(new GetObjectRequest { BucketName = _bucketName, Key = overlayKey });
            await using (var fs = File.Create(overlayPath))
                await overlayResponse.ResponseStream.CopyToAsync(fs);

            var arguments = _commandBuilder.Build(videoPath, overlayPath, outputPath);
            var result = await _processRunner.RunAsync("ffmpeg", arguments);

            if (result.ExitCode != 0)
                throw new InvalidOperationException($"FFmpeg exited with code {result.ExitCode}: {result.StandardError}");

            await _uploader.UploadAsync(outputPath, sessionId, jobId);
        }
        finally
        {
            if (Directory.Exists(tempDir))
                Directory.Delete(tempDir, recursive: true);
        }

    }

    private async Task<bool> OutputExistsAsync(string key)
    {
        try
        {
            await _s3.GetObjectMetadataAsync(new GetObjectMetadataRequest
            {
                BucketName = _bucketName,
                Key = key
            });
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    private async Task<bool> BothInputsExistAsync(string videoKey, string overlayKey)
    {
        try
        {
            await _s3.GetObjectMetadataAsync(new GetObjectMetadataRequest
            {
                BucketName = _bucketName,
                Key = videoKey
            });
            await _s3.GetObjectMetadataAsync(new GetObjectMetadataRequest
            {
                BucketName = _bucketName,
                Key = overlayKey
            });
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }
}