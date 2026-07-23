namespace Overlayer.Api.Middleware;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public class RequireRateLimitAttribute : Attribute
{
    public string PolicyName { get; }

    public RequireRateLimitAttribute(string policyName)
    {
        PolicyName = policyName;
    }
}
