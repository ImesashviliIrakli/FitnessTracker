using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Features;

// ---- Contracts ----

public sealed record PlanEntryDto(
    Guid Id, DateOnly Date, Guid? TemplateId, string? TemplateName, TemplateKind? Kind, PlanStatus Status,
    Guid? WorkoutId, Guid? SeriesId, string? Note);
public sealed record NextPlanDto(PlanEntryDto? Entry);
public sealed record CreatePlanEntry(Guid TemplateId, DateOnly Date, string? Note);
public sealed record CreateRecurringPlan(Guid TemplateId, DateOnly StartDate, List<DayOfWeek> Weekdays, int Weeks, string? Note);
public sealed record UpdatePlanEntry(DateOnly Date, Guid TemplateId, string? Note, PlanStatus Status);
public sealed record DeletedCount(int Deleted);

// ---- Validation ----

public sealed class CreatePlanEntryValidator : AbstractValidator<CreatePlanEntry>
{
    public CreatePlanEntryValidator()
    {
        RuleFor(x => x.TemplateId).NotEmpty();
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.Note).MaximumLength(500);
    }
}

public sealed class CreateRecurringPlanValidator : AbstractValidator<CreateRecurringPlan>
{
    public CreateRecurringPlanValidator()
    {
        RuleFor(x => x.TemplateId).NotEmpty();
        RuleFor(x => x.StartDate).NotEmpty();
        RuleFor(x => x.Weekdays).NotNull().Must(d => d.Count is >= 1 and <= 7 && d.Distinct().Count() == d.Count)
            .WithMessage("Pick 1–7 distinct weekdays.");
        RuleForEach(x => x.Weekdays).IsInEnum();
        RuleFor(x => x.Weeks).InclusiveBetween(1, 26);
        RuleFor(x => x.Note).MaximumLength(500);
    }
}

public sealed class UpdatePlanEntryValidator : AbstractValidator<UpdatePlanEntry>
{
    public UpdatePlanEntryValidator()
    {
        RuleFor(x => x.TemplateId).NotEmpty();
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.Note).MaximumLength(500);
        RuleFor(x => x.Status).Must(s => s is PlanStatus.Planned or PlanStatus.Skipped).WithMessage("Status must be Planned or Skipped.");
    }
}

// ---- Endpoints ----

public static class PlanEndpoints
{
    private static IQueryable<PlanEntryDto> Project(this IQueryable<PlanEntry> q) => q.Select(p => new PlanEntryDto(
        p.Id, p.Date, p.TemplateId, p.Template == null ? null : p.Template.Name, p.Template == null ? null : (TemplateKind?)p.Template.Kind,
        p.Status, p.WorkoutId, p.SeriesId, p.Note));

    private static IQueryable<PlanEntry> Owned(this AppDbContext db, Guid userId) => db.PlanEntries.Where(p => p.UserId == userId);

    private static Task<PlanEntryDto> DtoAsync(AppDbContext db, Guid id, CancellationToken ct) =>
        db.PlanEntries.AsNoTracking().Where(p => p.Id == id).Project().SingleAsync(ct);

    /// <summary>Today's first planned workout, else the next one within 14 days; rest days are skipped.</summary>
    public static Task<PlanEntryDto?> NextAsync(AppDbContext db, Guid userId, DateOnly today, CancellationToken ct) =>
        db.Owned(userId).AsNoTracking()
            .Where(p => p.Status == PlanStatus.Planned && p.Date >= today && p.Date <= today.AddDays(14)
                        && p.Template != null && p.Template.Kind == TemplateKind.Workout)
            .OrderBy(p => p.Date).ThenBy(p => p.Id)
            .Project().FirstOrDefaultAsync(ct);

    private static Task<bool> OwnsTemplateAsync(AppDbContext db, Guid userId, Guid templateId, CancellationToken ct) =>
        db.Templates.AnyAsync(t => t.Id == templateId && t.UserId == userId, ct);

    public static void MapPlan(this RouteGroupBuilder api)
    {
        var plan = api.MapGroup("/plan").WithTags("Plan");

        plan.MapGet("/", async (DateOnly? from, DateOnly? to, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            if (from is not { } start || to is not { } end) return HttpExtensions.Invalid("from", "from and to are required.");
            if (end < start || end.DayNumber - start.DayNumber > 400) return HttpExtensions.Invalid("to", "The range must be 0–400 days.");
            var rows = await db.Owned(ctx.User.UserId()).AsNoTracking()
                .Where(p => p.Date >= start && p.Date <= end)
                .OrderBy(p => p.Date).ThenBy(p => p.Id)
                .Project().ToListAsync(ct);
            return TypedResults.Ok(rows);
        });

        plan.MapGet("/next", async (AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            return TypedResults.Ok(new NextPlanDto(await NextAsync(db, u.Id, clock.Today(u.TimeZone), ct)));
        });

        plan.MapGet("/{id:guid}", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
            await db.Owned(ctx.User.UserId()).AsNoTracking().Where(p => p.Id == id).Project().SingleOrDefaultAsync(ct) is { } entry
                ? TypedResults.Ok(entry)
                : HttpExtensions.NotFound());

        plan.MapPost("/", async (CreatePlanEntry req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            if (!await OwnsTemplateAsync(db, userId, req.TemplateId, ct)) return HttpExtensions.Invalid("templateId", "Unknown template.");
            var p = new PlanEntry { UserId = userId, Date = req.Date, TemplateId = req.TemplateId, Status = PlanStatus.Planned, Note = req.Note?.Trim() };
            db.PlanEntries.Add(p);
            await db.SaveChangesAsync(ct);
            return TypedResults.Created($"/api/plan/{p.Id}", await DtoAsync(db, p.Id, ct));
        }).Validate<CreatePlanEntry>();

        plan.MapPost("/recurring", async (CreateRecurringPlan req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            if (!await OwnsTemplateAsync(db, userId, req.TemplateId, ct)) return HttpExtensions.Invalid("templateId", "Unknown template.");
            var seriesId = Guid.CreateVersion7();
            var entries = Enumerable.Range(0, req.Weeks * 7)
                .Select(req.StartDate.AddDays)
                .Where(d => req.Weekdays.Contains(d.DayOfWeek))
                .Select(d => new PlanEntry
                {
                    UserId = userId, Date = d, TemplateId = req.TemplateId, Status = PlanStatus.Planned, SeriesId = seriesId, Note = req.Note?.Trim(),
                }).ToList();
            db.PlanEntries.AddRange(entries);
            await db.SaveChangesAsync(ct);
            var rows = await db.Owned(userId).AsNoTracking().Where(p => p.SeriesId == seriesId).OrderBy(p => p.Date).Project().ToListAsync(ct);
            return TypedResults.Created($"/api/plan?from={entries[0].Date:yyyy-MM-dd}&to={entries[^1].Date:yyyy-MM-dd}", rows);
        }).Validate<CreateRecurringPlan>();

        plan.MapPut("/{id:guid}", async (Guid id, UpdatePlanEntry req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var p = await db.Owned(userId).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (p is null) return HttpExtensions.NotFound();
            if (p.Status == PlanStatus.Completed) return HttpExtensions.Conflict("A completed plan entry cannot be changed.");
            if (!await OwnsTemplateAsync(db, userId, req.TemplateId, ct)) return HttpExtensions.Invalid("templateId", "Unknown template.");
            p.Date = req.Date;
            p.TemplateId = req.TemplateId;
            p.Note = req.Note?.Trim();
            p.Status = req.Status;
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(await DtoAsync(db, p.Id, ct));
        }).Validate<UpdatePlanEntry>();

        plan.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var p = await db.Owned(ctx.User.UserId()).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (p is null) return HttpExtensions.NotFound();
            if (p.Status == PlanStatus.Completed) return HttpExtensions.Conflict("A completed plan entry is part of your history.");
            db.PlanEntries.Remove(p);
            await db.SaveChangesAsync(ct);
            return TypedResults.NoContent();
        });

        plan.MapDelete("/series/{seriesId:guid}", async (Guid seriesId, DateOnly? from, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            var start = from ?? clock.Today(u.TimeZone);
            var deleted = await db.Owned(u.Id)
                .Where(p => p.SeriesId == seriesId && p.Date >= start && p.Status != PlanStatus.Completed)
                .ExecuteDeleteAsync(ct);
            return TypedResults.Ok(new DeletedCount(deleted));
        });
    }
}
