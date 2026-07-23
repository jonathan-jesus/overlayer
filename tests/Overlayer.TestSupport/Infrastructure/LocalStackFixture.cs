using Amazon.DynamoDBv2;
using Amazon.S3;
using Amazon.S3.Model;
using Amazon.SQS;
using Amazon.SQS.Model;
using Testcontainers.LocalStack;

namespace Overlayer.TestSupport.Infrastructure;

public class LocalStackFixture : IAsyncLifetime
{
    private readonly LocalStackContainer _localStackContainer = new LocalStackBuilder("localstack/localstack:3")
        .Build();

    public string ConnectionString => _localStackContainer.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _localStackContainer.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await _localStackContainer.DisposeAsync();
    }

    public IAmazonDynamoDB GetDynamoDbClient()
    {
        var config = new AmazonDynamoDBConfig
        {
            ServiceURL           = ConnectionString,
            AuthenticationRegion = "us-east-2"
        };

        return new AmazonDynamoDBClient("test", "test", config);
    }

    public IAmazonS3 GetS3Client()
    {
        var config = new AmazonS3Config
        {
            ServiceURL = ConnectionString,
            ForcePathStyle = true,
            AuthenticationRegion = "us-east-2"
        };

        return new AmazonS3Client("test", "test", config);
    }

    public async Task CreateBucketAsync(string bucketName)
    {
        using var client = GetS3Client();
        try
        {
            await client.PutBucketAsync(new PutBucketRequest
            {
                BucketName = bucketName,
                UseClientRegion = false,
                BucketRegion = S3Region.USEast2
            });
        }
        catch (AmazonS3Exception ex) when (ex.ErrorCode == "BucketAlreadyOwnedByYou" || ex.ErrorCode == "BucketAlreadyExists")
        {
            // Bucket already exists, ignore
        }
    }

    public IAmazonSQS GetSqsClient()
    {
        var config = new AmazonSQSConfig
        {
            ServiceURL = ConnectionString,
            AuthenticationRegion = "us-east-2"
        };

        return new AmazonSQSClient("test", "test", config);
    }

    public async Task<string> CreateQueueAsync(string name)
    {
        using var client = GetSqsClient();
        var response = await client.CreateQueueAsync(new CreateQueueRequest { QueueName = name });
        return response.QueueUrl;
    }

    public async Task SendMessageAsync(string queueUrl, string body)
    {
        using var client = GetSqsClient();
        await client.SendMessageAsync(new SendMessageRequest
        {
            QueueUrl = queueUrl,
            MessageBody = body
        });
    }

    public async Task UploadObjectAsync(string bucketName, string key, Stream content)
    {
        using var client = GetS3Client();
        await client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = bucketName,
            Key = key,
            InputStream = content
        });
    }

    public async Task<bool> ObjectExistsAsync(string bucketName, string key)
    {
        using var client = GetS3Client();
        try
        {
            await client.GetObjectMetadataAsync(bucketName, key);
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }
}
