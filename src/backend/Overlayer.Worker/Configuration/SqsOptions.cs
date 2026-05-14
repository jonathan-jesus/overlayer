namespace Overlayer.Worker.Configuration;

public class SqsOptions
{
    public const string SectionName = "SQS";

    public string QueueUrl { get; set; } = string.Empty;
    public int WaitTimeSeconds { get; set; } = 20;
}
