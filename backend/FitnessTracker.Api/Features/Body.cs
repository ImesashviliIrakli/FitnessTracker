using System.Globalization;
using System.Text;
using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Features;

public sealed record WeightInput(DateOnly Date, decimal WeightKg, decimal? BodyFatPercent, string? Note);
public sealed record WeightEntryDto(Guid Id, DateOnly Date, decimal WeightKg, decimal? BodyFatPercent, decimal? LeanMassKg, decimal? Bmi, string? Note);

public sealed record MeasurementInput(
    DateOnly Date, decimal? WaistCm, decimal? ChestCm, decimal? HipsCm, decimal? ArmCm,
    decimal? ThighCm, decimal? NeckCm, decimal? ShouldersCm, string? Note);
public sealed record MeasurementDto(
    Guid Id, DateOnly Date, decimal? WaistCm, decimal? ChestCm, decimal? HipsCm, decimal? ArmCm,
    decimal? ThighCm, decimal? NeckCm, decimal? ShouldersCm, string? Note);

public sealed class WeightInputValidator : AbstractValidator<WeightInput>
{
    public WeightInputValidator()
    {
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.WeightKg).InclusiveBetween(20, 400);
        RuleFor(x => x.BodyFatPercent).InclusiveBetween(2, 70);
        RuleFor(x => x.Note).MaximumLength(500);
    }
}

public sealed class MeasurementInputValidator : AbstractValidator<MeasurementInput>
{
    public MeasurementInputValidator()
    {
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.WaistCm).InclusiveBetween(10, 300);
        RuleFor(x => x.ChestCm).InclusiveBetween(10, 300);
        RuleFor(x => x.HipsCm).InclusiveBetween(10, 300);
        RuleFor(x => x.ArmCm).InclusiveBetween(10, 300);
        RuleFor(x => x.ThighCm).InclusiveBetween(10, 300);
        RuleFor(x => x.NeckCm).InclusiveBetween(10, 300);
        RuleFor(x => x.ShouldersCm).InclusiveBetween(10, 300);
        RuleFor(x => x.Note).MaximumLength(500);
        RuleFor(x => x)
            .Must(x => new[] { x.WaistCm, x.ChestCm, x.HipsCm, x.ArmCm, x.ThighCm, x.NeckCm, x.ShouldersCm }.Any(v => v is not null))
            .OverridePropertyName("measurements").WithMessage("Enter at least one measurement.");
    }
}

public static class BodyEndpoints
{
    private static WeightEntryDto ToDto(WeightEntry w, decimal? heightCm) =>
        new(w.Id, w.Date, w.WeightKg, w.BodyFatPercent, Metrics.LeanMassKg(w.WeightKg, w.BodyFatPercent), Metrics.Bmi(w.WeightKg, heightCm), w.Note);

    private static MeasurementDto ToDto(MeasurementEntry m) =>
        new(m.Id, m.Date, m.WaistCm, m.ChestCm, m.HipsCm, m.ArmCm, m.ThighCm, m.NeckCm, m.ShouldersCm, m.Note);

    private static void Apply(MeasurementEntry m, MeasurementInput i)
    {
        m.Date = i.Date;
        m.WaistCm = i.WaistCm;
        m.ChestCm = i.ChestCm;
        m.HipsCm = i.HipsCm;
        m.ArmCm = i.ArmCm;
        m.ThighCm = i.ThighCm;
        m.NeckCm = i.NeckCm;
        m.ShouldersCm = i.ShouldersCm;
        m.Note = i.Note?.Trim();
    }

    public static void MapBody(this RouteGroupBuilder api)
    {
        var weights = api.MapGroup("/weights").WithTags("Weights");

        weights.MapGet("/", async (DateOnly? from, DateOnly? to, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            var end = to ?? clock.Today(u.TimeZone);
            var start = from ?? end.AddDays(-365);
            var rows = await db.Weights.AsNoTracking()
                .Where(w => w.UserId == u.Id && w.Date >= start && w.Date <= end)
                .OrderBy(w => w.Date).ToListAsync(ct);
            return TypedResults.Ok(rows.Select(w => ToDto(w, u.HeightCm)));
        });

        weights.MapPost("/", async (WeightInput req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            if (await db.Weights.AnyAsync(w => w.UserId == u.Id && w.Date == req.Date, ct))
                return HttpExtensions.Conflict("An entry for this date already exists. Edit it instead.");
            var entry = new WeightEntry { UserId = u.Id, Date = req.Date, WeightKg = req.WeightKg, BodyFatPercent = req.BodyFatPercent, Note = req.Note?.Trim() };
            db.Weights.Add(entry);
            u.GoalStartWeightKg ??= req.WeightKg;
            await db.SaveChangesAsync(ct);
            return TypedResults.Created($"/api/weights/{entry.Id}", ToDto(entry, u.HeightCm));
        }).Validate<WeightInput>();

        weights.MapPut("/{id:guid}", async (Guid id, WeightInput req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            var entry = await db.Weights.SingleOrDefaultAsync(w => w.Id == id && w.UserId == u.Id, ct);
            if (entry is null) return HttpExtensions.NotFound();
            if (req.Date != entry.Date && await db.Weights.AnyAsync(w => w.UserId == u.Id && w.Date == req.Date, ct))
                return HttpExtensions.Conflict("An entry for this date already exists.");
            entry.Date = req.Date;
            entry.WeightKg = req.WeightKg;
            entry.BodyFatPercent = req.BodyFatPercent;
            entry.Note = req.Note?.Trim();
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(ToDto(entry, u.HeightCm));
        }).Validate<WeightInput>();

        weights.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var deleted = await db.Weights.Where(w => w.Id == id && w.UserId == ctx.User.UserId()).ExecuteDeleteAsync(ct);
            return deleted == 0 ? HttpExtensions.NotFound() : TypedResults.NoContent();
        });

        weights.MapGet("/export.csv", async (AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var rows = await db.Weights.AsNoTracking().Where(w => w.UserId == ctx.User.UserId()).OrderBy(w => w.Date).ToListAsync(ct);
            var sb = new StringBuilder("date,weight_kg,body_fat_percent,note\n");
            foreach (var w in rows)
                sb.Append(CultureInfo.InvariantCulture, $"{w.Date:yyyy-MM-dd},{w.WeightKg},{w.BodyFatPercent},{Csv(w.Note)}\n");
            return Results.File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", "weights.csv");
        });

        var measurements = api.MapGroup("/measurements").WithTags("Measurements");

        measurements.MapGet("/", async (DateOnly? from, DateOnly? to, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var rows = await db.Measurements.AsNoTracking()
                .Where(m => m.UserId == userId && (from == null || m.Date >= from) && (to == null || m.Date <= to))
                .OrderBy(m => m.Date).ToListAsync(ct);
            return TypedResults.Ok(rows.Select(ToDto));
        });

        measurements.MapPost("/", async (MeasurementInput req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            if (await db.Measurements.AnyAsync(m => m.UserId == userId && m.Date == req.Date, ct))
                return HttpExtensions.Conflict("Measurements for this date already exist. Edit them instead.");
            var entry = new MeasurementEntry { UserId = userId };
            Apply(entry, req);
            db.Measurements.Add(entry);
            await db.SaveChangesAsync(ct);
            return TypedResults.Created($"/api/measurements/{entry.Id}", ToDto(entry));
        }).Validate<MeasurementInput>();

        measurements.MapPut("/{id:guid}", async (Guid id, MeasurementInput req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var entry = await db.Measurements.SingleOrDefaultAsync(m => m.Id == id && m.UserId == userId, ct);
            if (entry is null) return HttpExtensions.NotFound();
            if (req.Date != entry.Date && await db.Measurements.AnyAsync(m => m.UserId == userId && m.Date == req.Date, ct))
                return HttpExtensions.Conflict("Measurements for this date already exist.");
            Apply(entry, req);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(ToDto(entry));
        }).Validate<MeasurementInput>();

        measurements.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var deleted = await db.Measurements.Where(m => m.Id == id && m.UserId == ctx.User.UserId()).ExecuteDeleteAsync(ct);
            return deleted == 0 ? HttpExtensions.NotFound() : TypedResults.NoContent();
        });
    }

    /// <summary>Quotes a CSV field and defuses spreadsheet formula injection.</summary>
    public static string Csv(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if ("=+-@\t\r".Contains(value[0])) value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }
}
