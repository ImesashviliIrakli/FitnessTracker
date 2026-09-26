using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Features;

// Recovery and activity check-in. Deliberately has no food or drink fields.
public sealed record DailyInput(int? Steps, decimal? SleepHours, int? RestingHeartRate, int? Energy, int? Soreness, int? Mood, string? Note);
public sealed record DailyLogDto(DateOnly Date, int? Steps, decimal? SleepHours, int? RestingHeartRate, int? Energy, int? Soreness, int? Mood, string? Note);

public sealed class DailyInputValidator : AbstractValidator<DailyInput>
{
    public DailyInputValidator()
    {
        RuleFor(x => x.Steps).InclusiveBetween(0, 100_000);
        RuleFor(x => x.SleepHours).InclusiveBetween(0, 24);
        RuleFor(x => x.RestingHeartRate).InclusiveBetween(25, 220);
        RuleFor(x => x.Energy).InclusiveBetween(1, 5);
        RuleFor(x => x.Soreness).InclusiveBetween(1, 5);
        RuleFor(x => x.Mood).InclusiveBetween(1, 5);
        RuleFor(x => x.Note).MaximumLength(500);
        RuleFor(x => x).Custom((x, ctx) =>
        {
            if (x is { Steps: null, SleepHours: null, RestingHeartRate: null, Energy: null, Soreness: null, Mood: null }
                && string.IsNullOrWhiteSpace(x.Note))
                ctx.AddFailure("", "Fill in at least one value.");
        });
    }
}

public static class DailyEndpoints
{
    private static DailyLogDto ToDto(DailyLog d) =>
        new(d.Date, d.Steps, d.SleepHours, d.RestingHeartRate, d.Energy, d.Soreness, d.Mood, d.Note);

    public static void MapDaily(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/daily").WithTags("Daily check-in");

        g.MapGet("/", async (DateOnly? from, DateOnly? to, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            var end = to ?? clock.Today(u.TimeZone);
            var start = from ?? end.AddDays(-30);
            var rows = await db.DailyLogs.AsNoTracking()
                .Where(d => d.UserId == u.Id && d.Date >= start && d.Date <= end)
                .OrderBy(d => d.Date).ToListAsync(ct);
            return TypedResults.Ok(rows.Select(ToDto));
        });

        g.MapPut("/{date}", async (DateOnly date, DailyInput req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var log = await db.DailyLogs.SingleOrDefaultAsync(d => d.UserId == userId && d.Date == date, ct);
            if (log is null) db.DailyLogs.Add(log = new DailyLog { UserId = userId, Date = date });
            log.Steps = req.Steps;
            log.SleepHours = req.SleepHours;
            log.RestingHeartRate = req.RestingHeartRate;
            log.Energy = req.Energy;
            log.Soreness = req.Soreness;
            log.Mood = req.Mood;
            log.Note = req.Note?.Trim();
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(ToDto(log));
        }).Validate<DailyInput>();

        g.MapDelete("/{date}", async (DateOnly date, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var deleted = await db.DailyLogs.Where(d => d.UserId == ctx.User.UserId() && d.Date == date).ExecuteDeleteAsync(ct);
            return deleted == 0 ? HttpExtensions.NotFound() : TypedResults.NoContent();
        });
    }
}
