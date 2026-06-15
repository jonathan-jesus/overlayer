using System.Text.Json;
using System.Text.Json.Serialization;
using System.Globalization;
namespace Overlayer.Shared.Contracts;

public partial class RequestUploadUrlsResponse
{
    [JsonPropertyName("jobId")]
    public required string JobId { get; set; }
    [JsonPropertyName("overlayUpload")]
    public required PresignedUpload OverlayUpload { get; set; }
    [JsonPropertyName("videoUpload")]
    public required PresignedUpload VideoUpload { get; set; }
}

public partial class PresignedUpload
{
    [JsonPropertyName("fields")]
    public required Fields Fields { get; set; }
    [JsonPropertyName("maxFileSize")]
    public long MaxFileSize { get; set; }
    [JsonPropertyName("url")]
    public required string Url { get; set; }
}

public partial class Fields
{
    [JsonPropertyName("contentType")]
    public required string ContentType { get; set; }
    [JsonPropertyName("key")]
    public required string Key { get; set; }
    [JsonPropertyName("policy")]
    public required string Policy { get; set; }
    [JsonPropertyName("xAmzAlgorithm")]
    public required string XAmzAlgorithm { get; set; }
    [JsonPropertyName("xAmzCredential")]
    public required string XAmzCredential { get; set; }
    [JsonPropertyName("xAmzDate")]
    public required string XAmzDate { get; set; }
    [JsonPropertyName("xAmzSignature")]
    public required string XAmzSignature { get; set; }
    [JsonPropertyName("xAmzSecurityToken")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? XAmzSecurityToken { get; set; }
}

public partial class RequestUploadUrlsResponse
{
    public static RequestUploadUrlsResponse FromJson(string json) => JsonSerializer.Deserialize<RequestUploadUrlsResponse>(json, Converter.Settings) ?? throw new JsonException("Failed to deserialize RequestUploadUrlsResponse.");
}

public static class Serialize
{
    public static string ToJson(this RequestUploadUrlsResponse self) => JsonSerializer.Serialize(self, Converter.Settings);
}

internal static class Converter
{
    public static readonly JsonSerializerOptions Settings = new(JsonSerializerDefaults.General)
    {
        Converters =
            {
                new DateOnlyConverter(),
                new TimeOnlyConverter(),
                IsoDateTimeOffsetConverter.Singleton
            },
    };
}

public class DateOnlyConverter : JsonConverter<DateOnly>
{
    private readonly string serializationFormat;
    public DateOnlyConverter() : this(null) { }

    public DateOnlyConverter(string? serializationFormat)
    {
        this.serializationFormat = serializationFormat ?? "yyyy-MM-dd";
    }

    public override DateOnly Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString();
        return DateOnly.Parse(value!);
    }

    public override void Write(Utf8JsonWriter writer, DateOnly value, JsonSerializerOptions options)
            => writer.WriteStringValue(value.ToString(serializationFormat));
}

public class TimeOnlyConverter : JsonConverter<TimeOnly>
{
    private readonly string serializationFormat;

    public TimeOnlyConverter() : this(null) { }

    public TimeOnlyConverter(string? serializationFormat)
    {
        this.serializationFormat = serializationFormat ?? "HH:mm:ss.fff";
    }

    public override TimeOnly Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString();
        return TimeOnly.Parse(value!);
    }

    public override void Write(Utf8JsonWriter writer, TimeOnly value, JsonSerializerOptions options)
            => writer.WriteStringValue(value.ToString(serializationFormat));
}

internal class IsoDateTimeOffsetConverter : JsonConverter<DateTimeOffset>
{
    public override bool CanConvert(Type t) => t == typeof(DateTimeOffset);

    private const string DefaultDateTimeFormat = "yyyy'-'MM'-'dd'T'HH':'mm':'ss.FFFFFFFK";

    private DateTimeStyles _dateTimeStyles = DateTimeStyles.RoundtripKind;
    private string? _dateTimeFormat;
    private CultureInfo? _culture;

    public DateTimeStyles DateTimeStyles
    {
        get => _dateTimeStyles;
        set => _dateTimeStyles = value;
    }

    public string? DateTimeFormat
    {
        get => _dateTimeFormat ?? string.Empty;
        set => _dateTimeFormat = (string.IsNullOrEmpty(value)) ? null : value;
    }

    public CultureInfo Culture
    {
        get => _culture ?? CultureInfo.CurrentCulture;
        set => _culture = value;
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options)
    {
        string text;


        if ((_dateTimeStyles & DateTimeStyles.AdjustToUniversal) == DateTimeStyles.AdjustToUniversal
                || (_dateTimeStyles & DateTimeStyles.AssumeUniversal) == DateTimeStyles.AssumeUniversal)
        {
            value = value.ToUniversalTime();
        }

        text = value.ToString(_dateTimeFormat ?? DefaultDateTimeFormat, Culture);

        writer.WriteStringValue(text);
    }

    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        string? dateText = reader.GetString();

        if (string.IsNullOrEmpty(dateText) == false)
        {
            if (!string.IsNullOrEmpty(_dateTimeFormat))
            {
                return DateTimeOffset.ParseExact(dateText, _dateTimeFormat, Culture, _dateTimeStyles);
            }
            else
            {
                return DateTimeOffset.Parse(dateText, Culture, _dateTimeStyles);
            }
        }
        else
        {
            return default(DateTimeOffset);
        }
    }


    public static readonly IsoDateTimeOffsetConverter Singleton = new IsoDateTimeOffsetConverter();
}