namespace Overlayer.Api.Services;

public class ForwardedIpResolver : IClientIpResolver
{
    public string Resolve(HttpContext context)
    {
        if (context.Request.Headers.TryGetValue("X-Forwarded-For", out var values))
        {
            var raw = values.ToString();
            if (!string.IsNullOrWhiteSpace(raw))
            {
                return raw.Split(',')[0].Trim();
            }
        }

        return context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }
}
