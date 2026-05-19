using System.Text.Json;

namespace Overlayer.Worker.Messaging;

public static class SqsMessageParser
{
    public static (string SessionId, string JobId)? Parse(string messageBody)
    {
        using var doc = JsonDocument.Parse(messageBody);

        var root = doc.RootElement;
        var key = root.GetProperty("Records")[0]
                      .GetProperty("s3")
                      .GetProperty("object")
                      .GetProperty("key")
                      .GetString();

        if (string.IsNullOrEmpty(key))
            return null;

        var decodedKey = Uri.UnescapeDataString(key.Replace("+", " "));
        var parts = decodedKey.Split('/');

        if (parts.Length >= 3 && parts[0] == "jobs")
        {
            return (parts[1], parts[2]);
        }

        return null;
    }
}
