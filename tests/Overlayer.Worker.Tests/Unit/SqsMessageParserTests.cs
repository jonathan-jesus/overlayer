using Overlayer.Worker.Messaging;

namespace Overlayer.Worker.Tests.Unit;

public class SqsMessageParserTests
{
  private static string BuildS3EventBody(string objectKey)
  {
    // Raw SQS message reference: https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html
    // URL-encode the key exactly as S3 does (spaces → '+', slashes stay as-is)
    var encodedKey = Uri.EscapeDataString(objectKey).Replace("%2F", "/");

    return $$"""
                 {
                   "Records": [
                     {
                       "eventVersion": "2.1",
                       "eventSource": "aws:s3",
                       "awsRegion": "us-east-2",
                       "eventName": "ObjectCreated:Put",
                       "s3": {
                         "bucket": {
                           "name": "overlayer-bucket"
                         },
                         "object": {
                           "key": "{{encodedKey}}",
                           "size": 1024
                         }
                       }
                     }
                   ]
                 }
                 """;
  }

  [Fact]
  [Trait("Category", "Unit")]
  public void Parse_WithValidJobsKey_ReturnsCorrectSessionIdAndJobId()
  {
    var sessionId = "sessionId";
    var jobId = "jobId";
    var body = BuildS3EventBody($"jobs/{sessionId}/{jobId}/video.mp4");

    var result = SqsMessageParser.Parse(body);

    Assert.NotNull(result);
    Assert.Equal(sessionId, result.Value.SessionId);
    Assert.Equal(jobId, result.Value.JobId);
  }

  [Fact]
  [Trait("Category", "Unit")]
  public void Parse_WithKeyOutsideJobsPrefix_ReturnsNull()
  {
    var body = BuildS3EventBody("outputs/session-abc/job-xyz/output.mp4");

    var result = SqsMessageParser.Parse(body);

    Assert.Null(result);
  }

  [Fact]
  [Trait("Category", "Unit")]
  public void Parse_WithMalformedKey_ReturnsNull()
  {
    var body = BuildS3EventBody("jobs/only-two-parts");

    var result = SqsMessageParser.Parse(body);

    Assert.Null(result);
  }
}
