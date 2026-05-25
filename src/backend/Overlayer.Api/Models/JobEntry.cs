namespace Overlayer.Api.Models;

public record JobEntry(
    string JobId,
    string Status,
    DateTime CreatedAt,
    string? DownloadUrl,
    string? Reason = null);
