using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using Overlayer.Api.Configuration;
using Overlayer.Api.Models;
using Overlayer.Shared.Contracts;

namespace Overlayer.Api.Services;

public class S3StorageService : IStorageService
{
    private readonly S3Options _options;
    private readonly IAmazonS3 _s3Client;
    private readonly ILogger<S3StorageService> _logger;
    private readonly IAwsCredentialProvider _credentialProvider;

    public S3StorageService(IOptions<S3Options> options, IAmazonS3 s3Client, ILogger<S3StorageService> logger, IAwsCredentialProvider credentialProvider)
    {
        _logger = logger;
        _options = options.Value;
        _s3Client = s3Client;
        _credentialProvider = credentialProvider;
    }

    public Task<PresignedUpload> GeneratePresignedPostAsync(string key, string contentType, long maxFileSize)
    {
        var region = _options.Region;
        var dateStr = DateTime.UtcNow.ToString("yyyyMMddTHHmmssZ");
        var shortDate = DateTime.UtcNow.ToString("yyyyMMdd");

        var credential = $"{_options.AccessKey}/{shortDate}/{region}/s3/aws4_request";
        var algorithm = "AWS4-HMAC-SHA256";

        var policyDoc = new
        {
            expiration = DateTime.UtcNow.AddHours(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
            conditions = new object[]
            {
                new { bucket = _options.BucketName },
                new { key = key },
                new[] { "eq", "$Content-Type", contentType },
                new object[] { "content-length-range", 0, maxFileSize },
                new Dictionary<string, string> { { "x-amz-credential", credential } },
                new Dictionary<string, string> { { "x-amz-algorithm", algorithm } },
                new Dictionary<string, string> { { "x-amz-date", dateStr } }
            }
        };

        var policyJson = JsonSerializer.Serialize(policyDoc);
        var policyBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(policyJson));

        var signingKey = GetSignatureKey(_options.SecretKey, shortDate, region, "s3");
        using var hmac = new HMACSHA256(signingKey);
        var signatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(policyBase64));
        var signature = BitConverter.ToString(signatureBytes).Replace("-", "").ToLower();

        var baseUrl = _options.ForcePathStyle
            ? $"{_options.ServiceUrl}/{_options.BucketName}"
            : $"https://{_options.BucketName}.s3.{region}.amazonaws.com";

        return Task.FromResult(new PresignedUpload
        {
            Url = baseUrl,
            MaxFileSize = maxFileSize,
            Fields = new Fields
            {
                Key = key,
                XAmzCredential = credential,
                XAmzAlgorithm = algorithm,
                XAmzDate = dateStr,
                Policy = policyBase64,
                XAmzSignature = signature,
                ContentType = contentType
            }
        });
    }

    public async Task<IReadOnlyList<JobEntry>> ListJobsAsync(string sessionId)
    {
        var jobs = new Dictionary<string, JobEntryData>();

        // 1. Get completed jobs
        var outputsRequest = new ListObjectsV2Request
        {
            BucketName = _options.BucketName,
            Prefix = $"outputs/{sessionId}/"
        };
        var outputsResponse = await _s3Client.ListObjectsV2Async(outputsRequest);
        foreach (var obj in outputsResponse.S3Objects ?? [])
        {
            // outputs/{sessionId}/{jobId}/output.mp4  → COMPLETED
            // outputs/{sessionId}/{jobId}/error.json   → FAILED
            var parts = obj.Key.Split('/');
            if (parts.Length >= 4)
            {
                var jobId = parts[2];
                var fileName = parts[3];

                if (!jobs.TryGetValue(jobId, out var jobData))
                {
                    jobData = new JobEntryData
                    {
                        JobId = jobId,
                        CreatedAt = obj.LastModified.GetValueOrDefault()
                    };
                    jobs[jobId] = jobData;
                }

                if (fileName == "output.mp4")
                {
                    jobData.HasSuccessOutput = true;
                    jobData.Status = "COMPLETED";
                }
                else if (fileName == "error.json")
                {
                    jobData.HasErrorOutput = true;
                    jobData.Status = "FAILED";
                    jobData.FailureReason = await ReadFailureReasonAsync(obj.Key);
                }
            }
        }

        // 2. Get processing/missing assets jobs
        var inputsRequest = new ListObjectsV2Request
        {
            BucketName = _options.BucketName,
            Prefix = $"jobs/{sessionId}/"
        };
        var inputsResponse = await _s3Client.ListObjectsV2Async(inputsRequest);
        foreach (var obj in inputsResponse.S3Objects ?? [])
        {
            // jobs/{sessionId}/{jobId}/video.mp4 or overlay.png
            var parts = obj.Key.Split('/');
            if (parts.Length >= 4)
            {
                var jobId = parts[2];
                var filename = parts[3];

                if (!jobs.TryGetValue(jobId, out var jobData))
                {
                    jobData = new JobEntryData
                    {
                        JobId = jobId,
                        CreatedAt = obj.LastModified.GetValueOrDefault()
                    };
                    jobs[jobId] = jobData;
                }

                if (!jobData.HasSuccessOutput && !jobData.HasErrorOutput)
                {
                    // Update created at to be the earliest
                    if (obj.LastModified.GetValueOrDefault() < jobData.CreatedAt)
                    {
                        jobData.CreatedAt = obj.LastModified.GetValueOrDefault();
                    }

                    if (filename == "video.mp4") jobData.HasVideo = true;
                    if (filename == "overlay.png") jobData.HasOverlay = true;
                }
            }
        }

        var results = new List<JobEntry>();
        foreach (var data in jobs.Values)
        {
            string status = data.Status ?? (data.HasVideo && data.HasOverlay ? "PROCESSING" : "MISSING_ASSETS");
            string? downloadUrl = null;

            if (status == "COMPLETED")
            {
                var urlRequest = new GetPreSignedUrlRequest
                {
                    BucketName = _options.BucketName,
                    Key = $"outputs/{sessionId}/{data.JobId}/output.mp4",
                    Expires = DateTime.UtcNow.AddHours(1)
                };
                downloadUrl = _s3Client.GetPreSignedURL(urlRequest);
            }

            results.Add(new JobEntry(data.JobId, status, data.CreatedAt, downloadUrl, data.FailureReason));
        }

        return results;
    }

    private async Task<string?> ReadFailureReasonAsync(string key)
    {
        try
        {
            var getRequest = new GetObjectRequest
            {
                BucketName = _options.BucketName,
                Key = key
            };
            using var getResponse = await _s3Client.GetObjectAsync(getRequest);
            using var reader = new StreamReader(getResponse.ResponseStream);
            var json = await reader.ReadToEndAsync();

            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("reason", out var reasonEl))
                return reasonEl.GetString();
        }
        catch (Exception ex)
        {
            // Tombstone unreadable
            _logger.LogError(ex, "Could not read failure reason from tombstone {Key}", key);
        }
        return null;
    }

    private static byte[] GetSignatureKey(string key, string dateStamp, string regionName, string serviceName)
    {
        var kSecret = Encoding.UTF8.GetBytes("AWS4" + key);
        var kDate = HmacSha256(dateStamp, kSecret);
        var kRegion = HmacSha256(regionName, kDate);
        var kService = HmacSha256(serviceName, kRegion);
        return HmacSha256("aws4_request", kService);
    }

    private static byte[] HmacSha256(string data, byte[] key)
    {
        using var hmac = new HMACSHA256(key);
        return hmac.ComputeHash(Encoding.UTF8.GetBytes(data));
    }

    private class JobEntryData
    {
        public string JobId { get; set; } = "";
        public string? Status { get; set; }
        public DateTime CreatedAt { get; set; }
        public bool HasSuccessOutput { get; set; }
        public bool HasErrorOutput { get; set; }
        public bool HasVideo { get; set; }
        public bool HasOverlay { get; set; }
        public string? FailureReason { get; set; }
    }
}
