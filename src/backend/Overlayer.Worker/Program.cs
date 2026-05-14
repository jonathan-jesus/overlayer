using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Overlayer.Worker.Extensions;

var host = BuildHost(args);
host.Run();

public partial class Program
{
    public static IHost BuildHost(string[] args, Action<IServiceCollection>? overrides = null)
    {
        var builder = Host.CreateApplicationBuilder(args);
        builder.AddWorkerServices();
        overrides?.Invoke(builder.Services);
        return builder.Build();
    }
}