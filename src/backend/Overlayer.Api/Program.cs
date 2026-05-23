using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Overlayer.Api.Configuration;
using Overlayer.Api.Services;
using Overlayer.Shared.Contracts;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<S3Options>(builder.Configuration.GetSection(S3Options.SectionName));
builder.Services.Configure<UploadOptions>(builder.Configuration.GetSection(UploadOptions.SectionName));
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

app.MapGet("/api/jobs", ([FromHeader(Name = "X-Session-ID")] Guid sessionId)
    => Results.Ok());

app.Run();

public partial class Program { }
