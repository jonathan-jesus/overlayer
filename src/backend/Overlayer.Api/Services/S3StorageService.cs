using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Overlayer.Api.Configuration;
using Overlayer.Shared.Contracts;

namespace Overlayer.Api.Services;

public class S3StorageService : IStorageService
{
    private readonly S3Options _options;

    public S3StorageService(IOptions<S3Options> options)
    {
        _options = options.Value;
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
}
