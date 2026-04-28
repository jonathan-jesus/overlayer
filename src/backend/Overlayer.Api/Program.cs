using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.MapGet("/api/jobs/{jobId}/upload-urls", (string jobId, [FromHeader(Name = "X-Session-ID")] Guid sessionId) =>
{
    if (!Guid.TryParse(jobId, out _)) return Results.BadRequest();

    return Results.Ok(new
    {
        jobId,
        videoUpload = new
        {
            url = "https://...",
            fields = new
            {
                key = "jobs/session-id/job-id/overlay.png",
                xAmzCredential = "...",
                xAmzAlgorithm = "...",
                xAmzDate = "...",
                policy = "...",
                xAmzSignature = "...",
                contentType = "video/"
            },
            maxFileSize = 10485760
        },
        overlayUpload = new
        {
            url = "https://...",
            fields = new
            {
                key = "jobs/session-id/job-id/overlay.png",
                xAmzCredential = "...",
                xAmzAlgorithm = "...",
                xAmzDate = "...",
                policy = "...",
                xAmzSignature = "...",
                contentType = "image/png"
            },
            maxFileSize = 10485760
        }
    });
});

app.Run();

public partial class Program { }
