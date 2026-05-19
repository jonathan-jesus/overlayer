using Amazon.S3;
using Amazon.SQS;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Overlayer.Worker.Configuration;
using Overlayer.Worker.Ffmpeg;
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

        builder.Services.Configure<S3Options>(
            builder.Configuration.GetSection(S3Options.SectionName));
        builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<S3Options>>().Value);

        builder.Services.Configure<FfmpegOptions>(
            builder.Configuration.GetSection(FfmpegOptions.SectionName));
        builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<FfmpegOptions>>().Value);

        builder.Services.AddAWSService<IAmazonSQS>();
        builder.Services.AddAWSService<IAmazonS3>();
        builder.Services.AddSingleton<SqsPollingLoop>();
        builder.Services.AddSingleton<IProcessRunner, FfmpegProcessRunner>();
        builder.Services.AddSingleton<IFfmpegCommandBuilder, FfmpegCommandBuilder>();
        builder.Services.AddSingleton<IOutputUploader, S3OutputUploader>();
        builder.Services.AddSingleton<IJobProcessor, JobProcessor>();
        builder.Services.AddHostedService<SqsWorker>();

        return builder;
    }
}

