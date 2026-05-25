using System.Text;
using System.Text.Json;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using NSubstitute;
using Overlayer.Api.Configuration;
using Overlayer.Api.Services;

namespace Overlayer.Api.Tests.Unit;

public class S3StorageServiceTests
{
    private readonly IAmazonS3 _s3 = Substitute.For<IAmazonS3>();
    private readonly S3StorageService _sut;
    private const string Bucket = "test-bucket";
    private const string SessionId = "aaaaaaaa-0000-0000-0000-000000000000";
    private const string JobId = "bbbbbbbb-1111-1111-1111-111111111111";

    public S3StorageServiceTests()
    {
        var options = Options.Create(new S3Options
        {
            BucketName = Bucket,
            Region = "us-east-2",
            AccessKey = "test",
            SecretKey = "test",
            ForcePathStyle = true,
            ServiceUrl = "http://localhost:4566"
        });
        _sut = new S3StorageService(options, _s3);
    }

    [Fact]
    public async Task ListJobsAsync_WithOutputMp4_ReturnsCompleted()
    {
        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("outputs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response
            {
                S3Objects =
                [
                    new S3Object
                    {
                        Key = $"outputs/{SessionId}/{JobId}/output.mp4",
                        LastModified = DateTime.UtcNow
                    }
                ]
            }));

        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("jobs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response { S3Objects = [] }));

        _s3.GetPreSignedURL(Arg.Any<GetPreSignedUrlRequest>()).Returns("https://signed-url");

        var result = await _sut.ListJobsAsync(SessionId);

        var job = Assert.Single(result);
        Assert.Equal("COMPLETED", job.Status);
        Assert.NotNull(job.DownloadUrl);
        Assert.Null(job.Reason);
    }

    [Fact]
    public async Task ListJobsAsync_WithErrorJson_ReturnsFailedWithReason()
    {
        var tombstoneJson = """{"reason":"Video format not supported","stage":"process","timestamp":"2026-05-25T08:00:00Z"}""";
        var tombstoneStream = new MemoryStream(Encoding.UTF8.GetBytes(tombstoneJson));

        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("outputs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response
            {
                S3Objects =
                [
                    new S3Object
                    {
                        Key = $"outputs/{SessionId}/{JobId}/error.json",
                        LastModified = DateTime.UtcNow
                    }
                ]
            }));

        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("jobs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response { S3Objects = [] }));

        _s3.GetObjectAsync(
                Arg.Is<GetObjectRequest>(r => r.Key.EndsWith("error.json")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new GetObjectResponse { ResponseStream = tombstoneStream }));

        var result = await _sut.ListJobsAsync(SessionId);

        var job = Assert.Single(result);
        Assert.Equal("FAILED", job.Status);
        Assert.Null(job.DownloadUrl);
        Assert.Equal("Video format not supported", job.Reason);
    }

    [Fact]
    public async Task ListJobsAsync_WithBothInputFiles_ReturnsProcessing()
    {
        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("outputs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response { S3Objects = [] }));

        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("jobs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response
            {
                S3Objects =
                [
                    new S3Object { Key = $"jobs/{SessionId}/{JobId}/video.mp4",   LastModified = DateTime.UtcNow },
                    new S3Object { Key = $"jobs/{SessionId}/{JobId}/overlay.png", LastModified = DateTime.UtcNow }
                ]
            }));

        var result = await _sut.ListJobsAsync(SessionId);

        var job = Assert.Single(result);
        Assert.Equal("PROCESSING", job.Status);
        Assert.Null(job.DownloadUrl);
        Assert.Null(job.Reason);
    }

    [Fact]
    public async Task ListJobsAsync_WithOnlyVideoFile_ReturnsMissingAssets()
    {
        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("outputs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response { S3Objects = [] }));

        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("jobs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response
            {
                S3Objects =
                [
                    new S3Object { Key = $"jobs/{SessionId}/{JobId}/video.mp4", LastModified = DateTime.UtcNow }
                ]
            }));

        var result = await _sut.ListJobsAsync(SessionId);

        var job = Assert.Single(result);
        Assert.Equal("MISSING_ASSETS", job.Status);
        Assert.Null(job.DownloadUrl);
        Assert.Null(job.Reason);
    }

    [Fact]
    public async Task ListJobsAsync_WithNoObjects_ReturnsEmptyList()
    {
        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("outputs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response { S3Objects = [] }));

        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("jobs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response { S3Objects = [] }));

        var result = await _sut.ListJobsAsync(SessionId);

        Assert.Empty(result);
    }

    [Fact]
    public async Task ListJobsAsync_WithOutputAndInputObjects_CompletedWins()
    {
        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("outputs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response
            {
                S3Objects =
                [
                    new S3Object { Key = $"outputs/{SessionId}/{JobId}/output.mp4", LastModified = DateTime.UtcNow }
                ]
            }));

        _s3.ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.Prefix.StartsWith("jobs/")),
                Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new ListObjectsV2Response
            {
                S3Objects =
                [
                    new S3Object { Key = $"jobs/{SessionId}/{JobId}/video.mp4",   LastModified = DateTime.UtcNow },
                    new S3Object { Key = $"jobs/{SessionId}/{JobId}/overlay.png", LastModified = DateTime.UtcNow }
                ]
            }));

        _s3.GetPreSignedURL(Arg.Any<GetPreSignedUrlRequest>()).Returns("https://signed-url");

        var result = await _sut.ListJobsAsync(SessionId);

        var job = Assert.Single(result);
        Assert.Equal("COMPLETED", job.Status);
        Assert.NotNull(job.DownloadUrl);
    }

    [Fact]
    public async Task GeneratePresignedPostAsync_PathStyle_ReturnsCorrectUrl()
    {
        var result = await _sut.GeneratePresignedPostAsync("some/key", "video/mp4", 1024);

        Assert.Equal("http://localhost:4566/test-bucket", result.Url);
    }

    [Fact]
    public async Task GeneratePresignedPostAsync_VirtualHosted_ReturnsCorrectUrl()
    {
        var options = Options.Create(new S3Options
        {
            BucketName = Bucket,
            Region = "us-east-2",
            AccessKey = "test",
            SecretKey = "test",
            ForcePathStyle = false
        });
        var sut = new S3StorageService(options, _s3);

        var result = await sut.GeneratePresignedPostAsync("some/key", "video/mp4", 1024);

        Assert.Equal($"https://{Bucket}.s3.us-east-2.amazonaws.com", result.Url);
    }

    [Fact]
    public async Task GeneratePresignedPostAsync_ReturnsCorrectKey()
    {
        const string key = $"jobs/{SessionId}/{JobId}/video.mp4";

        var result = await _sut.GeneratePresignedPostAsync(key, "video/mp4", 1024);

        Assert.Equal(key, result.Fields.Key);
    }

    [Fact]
    public async Task GeneratePresignedPostAsync_ReturnsCorrectContentType()
    {
        const string contentType = "image/png";

        var result = await _sut.GeneratePresignedPostAsync("some/key", contentType, 1024);

        Assert.Equal(contentType, result.Fields.ContentType);
    }

    [Fact]
    public async Task GeneratePresignedPostAsync_ReturnsCorrectMaxFileSize()
    {
        const long maxFileSize = 10_485_760L;

        var result = await _sut.GeneratePresignedPostAsync("some/key", "video/mp4", maxFileSize);

        Assert.Equal(maxFileSize, result.MaxFileSize);
    }

    [Fact]
    public async Task GeneratePresignedPostAsync_CredentialContainsAccessKeyAndRegion()
    {
        var result = await _sut.GeneratePresignedPostAsync("some/key", "video/mp4", 1024);

        Assert.StartsWith("test/", result.Fields.XAmzCredential);
        Assert.Contains("/us-east-2/", result.Fields.XAmzCredential);
        Assert.EndsWith("/aws4_request", result.Fields.XAmzCredential);
    }

    [Fact]
    public async Task GeneratePresignedPostAsync_PolicyIsValidBase64Json()
    {
        var result = await _sut.GeneratePresignedPostAsync("some/key", "video/mp4", 1024);

        var policyJson = Encoding.UTF8.GetString(Convert.FromBase64String(result.Fields.Policy));
        using var doc = JsonDocument.Parse(policyJson);
        Assert.True(doc.RootElement.TryGetProperty("expiration", out _));
        Assert.True(doc.RootElement.TryGetProperty("conditions", out _));
    }

    [Fact]
    public async Task GeneratePresignedPostAsync_SignatureIs64CharLowercaseHex()
    {
        var result = await _sut.GeneratePresignedPostAsync("some/key", "video/mp4", 1024);

        Assert.Matches("^[0-9a-f]{64}$", result.Fields.XAmzSignature);
    }
}
