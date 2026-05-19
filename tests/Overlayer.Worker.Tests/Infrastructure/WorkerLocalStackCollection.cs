using Overlayer.TestSupport.Infrastructure;

namespace Overlayer.Worker.Tests.Infrastructure;

[CollectionDefinition("WorkerLocalStack")]
public class WorkerLocalStackCollection : ICollectionFixture<LocalStackFixture>
{
}
