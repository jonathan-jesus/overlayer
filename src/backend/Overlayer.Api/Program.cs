using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.MapGet("/api/jobs/{jobId}/upload-urls", (string jobId, [FromHeader(Name = "X-Session-ID")] Guid sessionId) =>
{
    return Results.Ok(new
    {
        jobId,
        videoUpload = new { },
        overlayUpload = new { }
    });
});

app.Run();

public partial class Program { }