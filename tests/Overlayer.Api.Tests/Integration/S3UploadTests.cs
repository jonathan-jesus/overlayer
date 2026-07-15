using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Overlayer.TestSupport.Infrastructure;

namespace Overlayer.Api.Tests.Integration;

public class S3UploadTests : IClassFixture<LocalStackFixture>
{
    private readonly LocalStackFixture _localStack;
    private const string BucketName = "overlayer-test";

    public S3UploadTests(LocalStackFixture localStack)
    {
        _localStack = localStack;
    }

    private class TestFactory : Infrastructure.BaseIntegrationApiFactory
    {
        public TestFactory(string connectionString, string bucketName, string dynamoDbConnectionString)
            : base(connectionString, bucketName, dynamoDbConnectionString) { }
    }

    private WebApplicationFactory<Program> CreateFactory() =>
        new TestFactory(_localStack.ConnectionString, BucketName, _localStack.ConnectionString);

    [Fact]
    public async Task Get_UploadUrls_PresignedPostUrl_AllowsSuccessfulUpload()
    {
        await _localStack.CreateBucketAsync(BucketName);

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var jobId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();

        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/jobs/{jobId}/upload-urls");
        request.Headers.Add("X-Session-ID", sessionId.ToString());

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        var videoUpload = json.GetProperty("videoUpload");
        var uploadUrl = videoUpload.GetProperty("url").GetString()!;
        var fields = videoUpload.GetProperty("fields");

        using var s3HttpClient = new HttpClient();
        using var formData = new MultipartFormDataContent();

        foreach (var field in fields.EnumerateObject())
        {
            var fieldName = JsonFieldNameToFormKey(field.Name);
            var fieldValue = field.Value.GetString()!;
            formData.Add(new StringContent(fieldValue), fieldName);
        }

        var fileBytes = "fake video content"u8.ToArray();
        formData.Add(new ByteArrayContent(fileBytes), "file", "video.mp4");

        var uploadResponse = await s3HttpClient.PostAsync(uploadUrl, formData);

        Assert.True(
            uploadResponse.StatusCode is HttpStatusCode.NoContent or HttpStatusCode.OK,
            $"Expected 204/200 from LocalStack S3 but got {(int)uploadResponse.StatusCode}");
    }

    private static string JsonFieldNameToFormKey(string jsonName) => jsonName switch
    {
        "key" => "key",
        "contentType" => "Content-Type",
        "policy" => "policy",
        "xAmzCredential" => "x-amz-credential",
        "xAmzAlgorithm" => "x-amz-algorithm",
        "xAmzDate" => "x-amz-date",
        "xAmzSignature" => "x-amz-signature",
        _ => jsonName
    };
}
