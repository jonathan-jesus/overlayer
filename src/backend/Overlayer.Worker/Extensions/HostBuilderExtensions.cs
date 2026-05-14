using Amazon.SQS;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Messaging;
using Overlayer.Worker.Processing;

namespace Overlayer.Worker.Extensions;

public static class HostBuilderExtensions
{
    public static IHostApplicationBuilder AddWorkerServices(this IHostApplicationBuilder builder)
    {
        builder.Services.Configure<SqsOptions>(
            builder.Configuration.GetSection(SqsOptions.SectionName));
        builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<SqsOptions>>().Value);

        builder.Services.AddAWSService<IAmazonSQS>();
        builder.Services.AddSingleton<SqsPollingLoop>();
        builder.Services.AddSingleton<IJobProcessor, JobProcessor>();
        builder.Services.AddHostedService<SqsWorker>();

        return builder;
    }
}

