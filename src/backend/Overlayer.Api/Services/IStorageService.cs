using Overlayer.Api.Models;
using Overlayer.Shared.Contracts;

namespace Overlayer.Api.Services;

public interface IStorageService
{
    Task<PresignedUpload> GeneratePresignedPostAsync(string key, string contentType, long maxFileSize);
    Task<IReadOnlyList<JobEntry>> ListJobsAsync(string sessionId);
}
