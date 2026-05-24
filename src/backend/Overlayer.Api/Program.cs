using Amazon.S3;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Overlayer.Api.Configuration;
using Overlayer.Api.Services;
using Overlayer.Shared.Contracts;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<S3Options>(builder.Configuration.GetSection(S3Options.SectionName));
builder.Services.Configure<UploadOptions>(builder.Configuration.GetSection(UploadOptions.SectionName));
builder.Services.AddSingleton<IAmazonS3>(sp =>
{
    var opts = sp.GetRequiredService<IOptions<S3Options>>().Value;

    var config = new AmazonS3Config
    {
        ForcePathStyle = opts.ForcePathStyle,
    };

    if (!string.IsNullOrWhiteSpace(opts.ServiceUrl))
    {
        config.ServiceURL = opts.ServiceUrl;
    }
    else
    {
        config.RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(opts.Region);
    }

    return new AmazonS3Client(opts.AccessKey, opts.SecretKey, config);
});
builder.Services.AddSingleton<IStorageService, S3StorageService>();

var app = builder.Build();

app.MapGet("/api/jobs/{jobId}/upload-urls", async (
    string jobId,
    [FromHeader(Name = "X-Session-ID")] Guid sessionId,
    [FromServices] IStorageService storageService,
    [FromServices] IOptions<UploadOptions> uploadOptions) =>
{
    if (!Guid.TryParse(jobId, out _)) return Results.BadRequest();

    var opts = uploadOptions.Value;
    var videoMaxFileSize = opts.VideoMaxFileSizeBytes;
    var overlayMaxFileSize = opts.OverlayMaxFileSizeBytes;

    var videoUpload = await storageService.GeneratePresignedPostAsync(
        $"jobs/{sessionId}/{jobId}/video.mp4",
        "video/mp4",
        videoMaxFileSize);

    var overlayUpload = await storageService.GeneratePresignedPostAsync(
        $"jobs/{sessionId}/{jobId}/overlay.png",
        "image/png",
        overlayMaxFileSize);

    return Results.Ok(new RequestUploadUrlsResponse
    {
        JobId = jobId,
        VideoUpload = videoUpload,
        OverlayUpload = overlayUpload
    });
});

app.MapGet("/api/jobs", async (
    [FromHeader(Name = "X-Session-ID")] Guid sessionId,
    [FromServices] IStorageService storageService) =>
{
    var jobs = await storageService.ListJobsAsync(sessionId.ToString());

    return Results.Ok(new
    {
        jobs = jobs.Select(j => new JobResponseDto
        {
            jobId = j.JobId,
            status = j.Status,
            createdAt = j.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            downloadUrl = j.DownloadUrl,
            reason = j.Reason
        }).ToArray()
    });
});

app.Run();

public partial class Program { }

public class JobResponseDto
{
    public string jobId { get; set; } = "";
    public string status { get; set; } = "";
    public string createdAt { get; set; } = "";
    public string? downloadUrl { get; set; }

    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string? reason { get; set; }
}
