using System.Net;
using System.Text.Json;
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
    private readonly IMediaValidator _validator;
    public JobProcessor(IAmazonS3 s3, S3Options options, IProcessRunner processRunner, IFfmpegCommandBuilder commandBuilder, IOutputUploader uploader, IMediaValidator validator)
    {
        _validator = validator;
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

        var lockKey = $"locks/{sessionId}/{jobId}.lock";

        if (!await AcquireLockAsync(lockKey))
            return;

        var tempDir = Path.Combine(Path.GetTempPath(), "overlayer", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        var videoPath = Path.Combine(tempDir, "video.mp4");
        var overlayPath = Path.Combine(tempDir, "overlay.png");
        var outputPath = Path.Combine(tempDir, "output.mp4");
        var errorKey = $"outputs/{sessionId}/{jobId}/error.json";

        try
        {
            var videoResponse = await _s3.GetObjectAsync(new GetObjectRequest { BucketName = _bucketName, Key = videoKey });
            await using (var fs = File.Create(videoPath))
                await videoResponse.ResponseStream.CopyToAsync(fs);

            var overlayResponse = await _s3.GetObjectAsync(new GetObjectRequest { BucketName = _bucketName, Key = overlayKey });
            await using (var fs = File.Create(overlayPath))
                await overlayResponse.ResponseStream.CopyToAsync(fs);

            var validationResult = await _validator.ValidateAsync(videoPath);
            if (!validationResult.IsValid)
            {
                await WriteTombstoneAsync(errorKey, validationResult.FailureReason!, "validation");
                return;
            }

            var arguments = _commandBuilder.Build(videoPath, overlayPath, outputPath);
            var result = await _processRunner.RunAsync("ffmpeg", arguments);

            if (result.ExitCode != 0)
            {
                await WriteTombstoneAsync(errorKey, result.StandardError);
                return;
            }

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

    private async Task<bool> AcquireLockAsync(string lockKey)
    {
        try
        {
            await _s3.PutObjectAsync(new PutObjectRequest
            {
                BucketName = _bucketName,
                Key = lockKey,
                ContentBody = string.Empty,
                Headers = { ["If-None-Match"] = "*" }
            });
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.PreconditionFailed)
        {
            return false;
        }
    }

    private async Task WriteTombstoneAsync(string errorKey, string reason, string stage = "process")
    {
        var body = JsonSerializer.Serialize(new
        {
            reason = reason,
            stage = stage,
            timestamp = DateTimeOffset.UtcNow.ToString("o")
        });

        await _s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = errorKey,
            ContentBody = body,
            ContentType = "application/json"
        });
    }
}