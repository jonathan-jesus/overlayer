using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Microsoft.Extensions.Options;
using Overlayer.Api.Configuration;

namespace Overlayer.Api.Services;

public class DynamoDbRateLimitStore : IRateLimitStore
{
    private readonly IAmazonDynamoDB _client;
    private readonly RateLimitOptions _options;
    private readonly SemaphoreSlim _tableInitLock = new(1, 1);

    public DynamoDbRateLimitStore(
        IAmazonDynamoDB client,
        IOptions<RateLimitOptions> options)
    {
        _client = client;
        _options = options.Value;
    }

    public async Task<long> IncrementAsync(string key, int windowSeconds)
    {
        var request = BuildUpdateRequest(key, windowSeconds);
        try
        {
            var response = await _client.UpdateItemAsync(request);
            return long.Parse(response.Attributes["Count"].N);
        }
        catch (ResourceNotFoundException)
        {
            await EnsureTableExistsAsync();
            var response = await _client.UpdateItemAsync(request);
            return long.Parse(response.Attributes["Count"].N);
        }
    }

    private UpdateItemRequest BuildUpdateRequest(string key, int windowSeconds)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var windowStart = now - (now % windowSeconds);
        var itemKey = $"{key}#{windowStart}";

        return new UpdateItemRequest
        {
            TableName = _options.TableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["Id"] = new AttributeValue { S = itemKey }
            },
            UpdateExpression = "ADD #count :incr",
            ExpressionAttributeNames = new Dictionary<string, string>
            {
                ["#count"] = "Count"
            },
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":incr"] = new AttributeValue { N = "1" }
            },
            ReturnValues = ReturnValue.UPDATED_NEW
        };
    }

    private async Task EnsureTableExistsAsync()
    {
        await _tableInitLock.WaitAsync();
        try
        {
            TableStatus? status = null;
            try
            {
                var create = await _client.CreateTableAsync(new CreateTableRequest
                {
                    TableName = _options.TableName,
                    AttributeDefinitions = [new AttributeDefinition("Id", ScalarAttributeType.S)],
                    KeySchema = [new KeySchemaElement("Id", KeyType.HASH)],
                    BillingMode = BillingMode.PAY_PER_REQUEST
                });
                status = create.TableDescription.TableStatus;
            }
            catch (ResourceInUseException)
            {
                // Table already exists
            }

            await WaitForActiveAsync(status);
        }
        finally
        {
            _tableInitLock.Release();
        }
    }

    private async Task WaitForActiveAsync(TableStatus? knownStatus)
    {
        if (knownStatus == TableStatus.ACTIVE) return;

        const int maxAttempts = 10;
        var delay = TimeSpan.FromMilliseconds(100);
        for (var attempt = 0; attempt < maxAttempts; attempt++)
        {
            var describe = await _client.DescribeTableAsync(_options.TableName);
            if (describe.Table.TableStatus == TableStatus.ACTIVE) return;

            await Task.Delay(delay);
            delay = TimeSpan.FromMilliseconds(Math.Min(delay.TotalMilliseconds * 2, 1000));
        }

        throw new TimeoutException($"DynamoDB table '{_options.TableName}' did not become ACTIVE in time");
    }

}
