using System.Security.Claims;
using FitnessTracker.Api.Data;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace FitnessTracker.Api.Common;

public static class HttpExtensions
{
    public static Guid UserId(this ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new InvalidOperationException("No user id claim."));

    public static RouteHandlerBuilder Validate<T>(this RouteHandlerBuilder b) => b.AddEndpointFilter<ValidationFilter<T>>();

    /// <summary>"Today" in the user's own timezone, so a late-evening workout lands on the right day.</summary>
    public static DateOnly Today(this TimeProvider clock, string timeZone) =>
        DateOnly.FromDateTime(ToLocal(clock.GetUtcNow().UtcDateTime, timeZone));

    public static DateTime ToLocal(DateTime utc, string timeZone) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc),
            TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out var found) ? found : TimeZoneInfo.Utc);

    public static IResult NotFound() => TypedResults.Problem(statusCode: 404, title: "Not found");
    public static IResult Conflict(string detail) => TypedResults.Problem(statusCode: 409, title: "Conflict", detail: detail);
    public static IResult Invalid(string field, string message) =>
        TypedResults.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });
}

/// <summary>Wall-clock times travel as "HH:mm" (seconds accepted on input).</summary>
public sealed class HourMinuteConverter : System.Text.Json.Serialization.JsonConverter<TimeOnly>
{
    public override TimeOnly Read(ref System.Text.Json.Utf8JsonReader reader, Type typeToConvert, System.Text.Json.JsonSerializerOptions options) =>
        TimeOnly.TryParseExact(reader.GetString(), ["HH:mm", "HH:mm:ss"], out var t) ? t : throw new System.Text.Json.JsonException("Time must be HH:mm.");

    public override void Write(System.Text.Json.Utf8JsonWriter writer, TimeOnly value, System.Text.Json.JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToString("HH:mm"));
}

/// <summary>
/// Plain-English validation messages: "Target weight must be between 20 and 400." instead of
/// "'target Weight Kg' must be between 20 and 400. You entered 9999."
/// </summary>
public sealed partial class ValidationText : FluentValidation.Resources.LanguageManager
{
    private static readonly Dictionary<string, string> Names = new()
    {
        ["Rpe"] = "RPE", ["Rir"] = "RIR", ["Met"] = "MET", ["TargetPercent1Rm"] = "Target % of 1RM",
    };
    private static readonly string[] Units = ["Kg", "Cm", "Percent", "Seconds", "Minutes", "M"];

    public ValidationText() => Culture = System.Globalization.CultureInfo.GetCultureInfo("en");

    public override string GetString(string key, System.Globalization.CultureInfo? culture = null) =>
        YouEntered().Replace(base.GetString(key, culture), "").Replace("'", "");

    /// <summary>PascalCase member name to a sentence-case label without unit suffixes: TargetWeightKg -> "Target weight".</summary>
    public static string DisplayName(string member)
    {
        if (Names.TryGetValue(member, out var name)) return name;
        var words = CaseBoundary().Split(member);
        if (words.Length > 1 && Units.Contains(words[^1])) words = words[..^1];
        var text = string.Join(' ', words).ToLowerInvariant();
        return char.ToUpperInvariant(text[0]) + text[1..];
    }

    [System.Text.RegularExpressions.GeneratedRegex(@"\s*You entered.*$")]
    private static partial System.Text.RegularExpressions.Regex YouEntered();

    [System.Text.RegularExpressions.GeneratedRegex("(?<=[a-z0-9])(?=[A-Z])")]
    private static partial System.Text.RegularExpressions.Regex CaseBoundary();
}

public sealed class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        if (ctx.Arguments.OfType<T>().FirstOrDefault() is not { } arg)
            return TypedResults.Problem(statusCode: 400, title: "Request body is required.");
        var result = await validator.ValidateAsync(arg, ctx.HttpContext.RequestAborted);
        // A form-level error (no field) also becomes the detail, which clients show as the message.
        return result.IsValid ? await next(ctx)
            : TypedResults.ValidationProblem(result.ToDictionary(), detail: result.Errors.FirstOrDefault(e => e.PropertyName == "")?.ErrorMessage);
    }
}

/// <summary>
/// CSRF defense for cookie auth: unsafe methods must carry a custom header, which browsers can only send
/// cross-origin after a CORS preflight that our policy rejects for unknown origins.
/// </summary>
public sealed class CsrfHeaderMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        var unsafeMethod = !(HttpMethods.IsGet(ctx.Request.Method) || HttpMethods.IsHead(ctx.Request.Method) || HttpMethods.IsOptions(ctx.Request.Method));
        if (unsafeMethod && ctx.Request.Path.StartsWithSegments("/api") && ctx.Request.Headers["X-CSRF"] != "1")
        {
            await Results.Problem(statusCode: 400, title: "Missing X-CSRF header.").ExecuteAsync(ctx);
            return;
        }
        await next(ctx);
    }
}

/// <summary>Maps unique-constraint races to 409 instead of 500.</summary>
public sealed class UniqueViolationHandler(IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        if (ex is not DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } }) return false;
        ctx.Response.StatusCode = StatusCodes.Status409Conflict;
        return await problems.TryWriteAsync(new()
        {
            HttpContext = ctx,
            ProblemDetails = new ProblemDetails { Status = 409, Title = "Conflict", Detail = "An entry for this date already exists." },
        });
    }
}

public static class UserQueries
{
    public static Task<AppUser> CurrentUserAsync(this AppDbContext db, ClaimsPrincipal user, CancellationToken ct) =>
        db.Users.SingleAsync(u => u.Id == user.UserId(), ct);

    public static Task<WeightEntry?> LatestWeightAsync(this AppDbContext db, Guid userId, CancellationToken ct) =>
        db.Weights.AsNoTracking().Where(w => w.UserId == userId).OrderByDescending(w => w.Date).FirstOrDefaultAsync(ct);
}
