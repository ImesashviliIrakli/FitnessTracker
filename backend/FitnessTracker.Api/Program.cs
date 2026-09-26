using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FitnessTracker.Api.Features;
using FluentValidation;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Scalar.AspNetCore;
using Serilog;
using Serilog.Formatting.Compact;

var builder = WebApplication.CreateBuilder(args);

// Per-machine overrides (e.g. a local connection string). Gitignored via appsettings.*.local.json;
// production gets the same keys as environment variables.
builder.Configuration.AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.local.json", optional: true, reloadOnChange: true);

var config = builder.Configuration;
var isDev = builder.Environment.IsDevelopment();

// Logging: structured JSON to stdout in containers, readable text locally.
builder.Services.AddSerilog(lc =>
{
    lc.ReadFrom.Configuration(config).Enrich.FromLogContext();
    if (isDev) lc.WriteTo.Console();
    else lc.WriteTo.Console(new RenderedCompactJsonFormatter());
});

// Data
var connectionString = config.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("ConnectionStrings:Default is not configured.");
builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connectionString));
builder.Services.AddSingleton(TimeProvider.System);

// Auth: Identity with an HttpOnly cookie. The API and SPA share a parent domain, so SameSite=Lax works.
builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme).AddIdentityCookies();
builder.Services.AddAuthorization();
builder.Services.AddIdentityCore<AppUser>(o =>
    {
        o.User.RequireUniqueEmail = true;
        o.Password.RequiredLength = 10;
        o.Password.RequireDigit = true;
        o.Password.RequireUppercase = true;
        o.Password.RequireLowercase = true;
        o.Password.RequireNonAlphanumeric = false;
        o.Lockout.MaxFailedAccessAttempts = 5;
        o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager();
builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "ft_auth";
    o.Cookie.HttpOnly = true;
    o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.ExpireTimeSpan = TimeSpan.FromDays(14);
    o.SlidingExpiration = true;
    // APIs answer with status codes, never login-page redirects.
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});
// Keys live in Postgres so cookies survive container restarts and redeploys.
builder.Services.AddDataProtection().PersistKeysToDbContext<AppDbContext>().SetApplicationName("FitnessTracker");

// CORS: only the configured frontend origin(s), with credentials. Accepts an array or a comma-separated string.
var origins = config.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? config["Cors:AllowedOrigins"]?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(origins)
    .AllowCredentials()
    .WithHeaders("Content-Type", "X-CSRF")
    .WithMethods("GET", "POST", "PUT", "DELETE")
    .WithExposedHeaders("Content-Disposition")
    .SetPreflightMaxAge(TimeSpan.FromHours(1))));

// Rate limiting: tight on auth endpoints, generous per user elsewhere.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    var authLimit = config.GetValue("RateLimiting:AuthPerMinute", 10);
    var userLimit = config.GetValue("RateLimiting:PerUserPerMinute", 300);
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = authLimit, Window = TimeSpan.FromMinutes(1) }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.Identity?.Name ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = userLimit, Window = TimeSpan.FromMinutes(1) }));
});

// Behind Traefik (Dokploy): trust X-Forwarded-* so scheme and client IP are correct.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.Converters.Add(new HourMinuteConverter());
});
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<UniqueViolationHandler>();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
// Error keys stay camelCase (the SPA maps them onto fields); messages read "Target weight must be between 20 and 400."
ValidatorOptions.Global.PropertyNameResolver = (_, member, _) => member is null ? null : JsonNamingPolicy.CamelCase.ConvertName(member.Name);
ValidatorOptions.Global.DisplayNameResolver = (_, member, _) => member is null ? null : ValidationText.DisplayName(member.Name);
ValidatorOptions.Global.LanguageManager = new ValidationText();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>("database");

// OpenTelemetry: exported only when OTEL_EXPORTER_OTLP_ENDPOINT is set.
var otel = builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("fitnesstracker-api"))
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation(o => o.Filter = ctx => !ctx.Request.Path.StartsWithSegments("/health"))
        .AddHttpClientInstrumentation()
        .AddNpgsql())
    .WithMetrics(m => m.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation());
if (!string.IsNullOrWhiteSpace(config["OTEL_EXPORTER_OTLP_ENDPOINT"])) otel.UseOtlpExporter();

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
if (!isDev) app.UseHsts();
app.UseSerilogRequestLogging();
app.UseCors();
app.UseMiddleware<CsrfHeaderMiddleware>();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

if (isDev)
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.MapHealthChecks("/health");
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });

app.MapAuth();
var api = app.MapGroup("/api").RequireAuthorization();
api.MapProfile();
api.MapBody();
api.MapDaily();
api.MapTraining();
api.MapPlan();
api.MapSessions();
api.MapDashboard();
api.MapCalculator();
api.MapAccount();

// Migrations apply on startup (creates the database if missing). Keep them expand-only so a
// rollback to the previous image still runs against the newer schema.
await using (var scope = app.Services.CreateAsyncScope())
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();

app.Run();

public partial class Program;
