using System.Reflection;
using System.Text.Json.Nodes;
using Json.Schema;
using Xunit.Sdk;

namespace Overlayer.TestSupport.Assertions;

public static class JsonSchemaAssertions
{
    private static readonly Assembly SharedAssembly =
        Assembly.Load("Overlayer.Shared");

    public static void ShouldMatchSchema(this string json, string schemaFileName)
    {
        var resourceName = SharedAssembly
            .GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith(schemaFileName))
            ?? throw new XunitException(
                $"Embedded resource '{schemaFileName}' not found in Overlayer.Shared. " +
                $"Available: [{string.Join(", ", SharedAssembly.GetManifestResourceNames())}]");

        using var stream = SharedAssembly.GetManifestResourceStream(resourceName)!;
        using var reader = new StreamReader(stream);

        var schema = JsonSchema.FromText(reader.ReadToEnd());
        var instance = JsonNode.Parse(json);

        var result = schema.Evaluate(instance, new EvaluationOptions
        {
            OutputFormat = OutputFormat.List
        });

        if (!result.IsValid)
        {
            var errors = result.Details
                .Where(d => !d.IsValid && d.Errors != null)
                .SelectMany(d => d.Errors!.Select(e =>
                    $"  {d.InstanceLocation}: {e.Key} — {e.Value}"))
                .ToList();

            Assert.Fail(
                $"JSON does not match schema '{schemaFileName}':\n{string.Join("\n", errors)}");
        }
    }
}
