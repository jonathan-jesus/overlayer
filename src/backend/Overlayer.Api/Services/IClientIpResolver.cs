namespace Overlayer.Api.Services;

public interface IClientIpResolver
{
    string Resolve(HttpContext context);
}
