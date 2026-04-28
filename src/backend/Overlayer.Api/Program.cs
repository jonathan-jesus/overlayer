using Microsoft.AspNetCore.Mvc;
using Overlayer.Shared.Contracts;

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.MapGet("/api/jobs/{jobId}/upload-urls", (string jobId, [FromHeader(Name = "X-Session-ID")] Guid sessionId) =>
{
    if (!Guid.TryParse(jobId, out _)) return Results.BadRequest();

    return Results.Ok(new RequestUploadUrlsResponse
    {
        JobId = jobId,
        VideoUpload = new PresignedUpload
        {
            Url = "https://...",
            Fields = new Fields
            {
                Key = "jobs/session-id/job-id/overlay.png",
                XAmzCredential = "...",
                XAmzAlgorithm = "...",
                XAmzDate = "...",
                Policy = "...",
                XAmzSignature = "...",
                ContentType = "video/"
            },
            MaxFileSize = 10485760
        },
        OverlayUpload = new PresignedUpload
        {
            Url = "https://...",
            Fields = new Fields
            {
                Key = "jobs/session-id/job-id/overlay.png",
                XAmzCredential = "...",
                XAmzAlgorithm = "...",
                XAmzDate = "...",
                Policy = "...",
                XAmzSignature = "...",
                ContentType = "image/png"
            },
            MaxFileSize = 4194304
        }
    });
});

app.Run();

public partial class Program { }
