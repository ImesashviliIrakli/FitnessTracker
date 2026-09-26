using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Features;

// ---- Contracts ----

public sealed record ExerciseDto(Guid Id, string Name, ExerciseCategory Category, string? PrimaryMuscle, decimal? Met, bool IsCustom);
public sealed record CreateExercise(string Name, ExerciseCategory Category, string? PrimaryMuscle, decimal? Met);

public sealed record SetInput(
    int? Reps, decimal? WeightKg, decimal? Rpe, int? Rir, int? RestSeconds, string? Tempo,
    int? DurationSeconds, decimal? DistanceM, int? AvgHeartRate, bool IsWarmup);
public sealed record WorkoutExerciseInput(Guid ExerciseId, int? SupersetGroup, string? Notes, List<SetInput> Sets);
public sealed record WorkoutInput(
    DateOnly Date, string Name, int? DurationMinutes, string? Notes, List<WorkoutExerciseInput> Exercises,
    TimeOnly? StartTime = null, WorkoutType? Type = null, Guid? TemplateId = null, Guid? PlanEntryId = null);

public sealed record SetDto(
    int? Reps, decimal? WeightKg, decimal? Rpe, int? Rir, int? RestSeconds, string? Tempo,
    int? DurationSeconds, decimal? DistanceM, int? AvgHeartRate, bool IsWarmup, decimal? Estimated1Rm, decimal? PaceSecPerKm);
public sealed record WorkoutExerciseDto(Guid ExerciseId, string ExerciseName, ExerciseCategory Category, int? SupersetGroup, string? Notes, List<SetDto> Sets);
public sealed record WorkoutDto(
    Guid Id, DateOnly Date, string Name, int? DurationMinutes, string? Notes,
    decimal TotalVolumeKg, decimal? EstimatedCalories, List<WorkoutExerciseDto> Exercises,
    TimeOnly? StartTime, WorkoutType Type, Guid? TemplateId, Guid? PlanEntryId);
public sealed record WorkoutSummaryDto(
    Guid Id, DateOnly Date, string Name, int? DurationMinutes, int ExerciseCount, int SetCount, decimal TotalVolumeKg, decimal? EstimatedCalories,
    TimeOnly? StartTime, WorkoutType Type, Guid? TemplateId, Guid? PlanEntryId);

public sealed record TemplateItemInput(
    Guid ExerciseId, int Sets, int? Reps, decimal? TargetWeightKg, decimal? TargetPercent1Rm = null,
    int? RestSeconds = null, string? Tempo = null, decimal? Rpe = null, int? Rir = null, string? Notes = null,
    int? Group = null, GroupType? GroupType = null);
public sealed record TemplateInput(string Name, string? Description, List<TemplateItemInput> Exercises, TemplateKind Kind = TemplateKind.Workout);
public sealed record TemplateItemDto(
    Guid ExerciseId, string ExerciseName, ExerciseCategory Category, int Sets, int? Reps, decimal? TargetWeightKg, decimal? TargetPercent1Rm,
    int? RestSeconds, string? Tempo, decimal? Rpe, int? Rir, string? Notes, int? Group, GroupType? GroupType);
public sealed record TemplateDto(Guid Id, string Name, string? Description, TemplateKind Kind, List<TemplateItemDto> Exercises);

public sealed record PersonalRecordDto(
    Guid ExerciseId, string ExerciseName, decimal BestWeightKg, DateOnly BestWeightDate, decimal? Best1Rm, DateOnly? Best1RmDate, int BestWeightReps);

// ---- Validation ----

public sealed class CreateExerciseValidator : AbstractValidator<CreateExercise>
{
    public CreateExerciseValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.PrimaryMuscle).MaximumLength(50);
        RuleFor(x => x.Met).InclusiveBetween(1, 25);
    }
}

public sealed class WorkoutInputValidator : AbstractValidator<WorkoutInput>
{
    public const string TempoPattern = "^[0-9Xx]{1,2}(-[0-9Xx]{1,2}){3}$";

    public WorkoutInputValidator()
    {
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.DurationMinutes).InclusiveBetween(1, 1440);
        RuleFor(x => x.Notes).MaximumLength(2000);
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.Exercises).NotNull().Must(e => e.Count <= 50).WithMessage("A workout can have at most 50 exercises.");
        RuleForEach(x => x.Exercises).ChildRules(e =>
        {
            e.RuleFor(x => x.ExerciseId).NotEmpty();
            e.RuleFor(x => x.SupersetGroup).InclusiveBetween(1, 50);
            e.RuleFor(x => x.Notes).MaximumLength(500);
            e.RuleFor(x => x.Sets).NotNull().Must(s => s.Count <= 50).WithMessage("An exercise can have at most 50 sets.");
            e.RuleForEach(x => x.Sets).ChildRules(s =>
            {
                s.RuleFor(x => x.Reps).InclusiveBetween(0, 1000);
                s.RuleFor(x => x.WeightKg).InclusiveBetween(0, 1000);
                s.RuleFor(x => x.Rpe).InclusiveBetween(1, 10);
                s.RuleFor(x => x.Rir).InclusiveBetween(0, 10);
                s.RuleFor(x => x.RestSeconds).InclusiveBetween(0, 3600);
                s.RuleFor(x => x.Tempo).Matches(TempoPattern).WithMessage("Tempo looks like 3-1-1-0.");
                s.RuleFor(x => x.DurationSeconds).InclusiveBetween(0, 86_400);
                s.RuleFor(x => x.DistanceM).InclusiveBetween(0, 1_000_000);
                s.RuleFor(x => x.AvgHeartRate).InclusiveBetween(30, 250);
            });
        });
    }
}

public sealed class TemplateInputValidator : AbstractValidator<TemplateInput>
{
    public TemplateInputValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(500);
        RuleFor(x => x.Kind).IsInEnum();
        RuleFor(x => x.Exercises).NotNull();
        RuleFor(x => x.Exercises).Must(e => e.Count is >= 1 and <= 50).When(x => x.Kind == TemplateKind.Workout && x.Exercises is not null)
            .WithMessage("A workout template needs 1–50 exercises.");
        RuleFor(x => x.Exercises).Empty().When(x => x.Kind == TemplateKind.RestDay).WithMessage("A rest day has no exercises.");
        RuleForEach(x => x.Exercises).ChildRules(e =>
        {
            e.RuleFor(x => x.ExerciseId).NotEmpty();
            e.RuleFor(x => x.Sets).InclusiveBetween(1, 20);
            e.RuleFor(x => x.Reps).InclusiveBetween(1, 1000);
            e.RuleFor(x => x.TargetWeightKg).InclusiveBetween(0, 1000);
            e.RuleFor(x => x.TargetPercent1Rm).InclusiveBetween(30, 110);
            e.RuleFor(x => x.RestSeconds).InclusiveBetween(0, 3600);
            e.RuleFor(x => x.Tempo).Matches(WorkoutInputValidator.TempoPattern).WithMessage("Tempo looks like 3-1-1-0.");
            e.RuleFor(x => x.Rpe).InclusiveBetween(1, 10);
            e.RuleFor(x => x.Rir).InclusiveBetween(0, 10);
            e.RuleFor(x => x.Notes).MaximumLength(500);
            e.RuleFor(x => x.Group).InclusiveBetween(1, 20);
            e.RuleFor(x => x.GroupType).IsInEnum();
        });
    }
}

// ---- Endpoints ----

public static class TrainingEndpoints
{
    private static ExerciseDto ToDto(Exercise e) => new(e.Id, e.Name, e.Category, e.PrimaryMuscle, e.Met, e.UserId is not null);

    private static IQueryable<Exercise> Visible(this AppDbContext db, Guid userId) =>
        db.Exercises.Where(e => e.UserId == null || e.UserId == userId);

    internal static async Task<Dictionary<Guid, Exercise>> ResolveExercisesAsync(AppDbContext db, Guid userId, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var wanted = ids.Distinct().ToList();
        return await db.Visible(userId).AsNoTracking().Where(e => wanted.Contains(e.Id)).ToDictionaryAsync(e => e.Id, ct);
    }

    private static IQueryable<Workout> WithGraph(this IQueryable<Workout> q) =>
        q.Include(w => w.Exercises).ThenInclude(e => e.Sets).Include(w => w.Exercises).ThenInclude(e => e.Exercise).AsSplitQuery();

    public static decimal Volume(Workout w) =>
        w.Exercises.SelectMany(e => e.Sets).Sum(s => Metrics.SetVolume(s.WeightKg, s.Reps, s.IsWarmup));

    /// <summary>
    /// MET estimate: timed sets use their own duration; the rest of the session (if a duration is given)
    /// uses the average MET of the untimed exercises. Null without a bodyweight.
    /// </summary>
    public static decimal? EstimateCalories(Workout w, decimal? bodyWeightKg) =>
        EstimateCalories(w.DurationMinutes, w.Exercises.Select(e => (e.Exercise.Met, e.Sets.Sum(s => s.DurationSeconds ?? 0))), bodyWeightKg);

    /// <param name="exercises">Per workout exercise: its MET and the summed duration of its sets.</param>
    public static decimal? EstimateCalories(int? durationMinutes, IEnumerable<(decimal? Met, int Seconds)> exercises, decimal? bodyWeightKg)
    {
        if (bodyWeightKg is not { } bw) return null;
        decimal kcal = 0;
        var timedSeconds = 0;
        var untimedMets = new List<decimal>();
        foreach (var (exerciseMet, seconds) in exercises)
        {
            var met = exerciseMet ?? 0;
            if (seconds > 0)
            {
                kcal += Metrics.MetCalories(met, bw, seconds / 3600m);
                timedSeconds += seconds;
            }
            else untimedMets.Add(met);
        }
        if (durationMinutes is { } minutes && untimedMets.Count > 0 && minutes * 60 > timedSeconds)
            kcal += Metrics.MetCalories(untimedMets.Average(), bw, (minutes * 60 - timedSeconds) / 3600m);
        return kcal > 0 ? Math.Round(kcal) : null;
    }

    internal static WorkoutDto ToDto(Workout w, decimal? bodyWeightKg) => new(
        w.Id, w.Date, w.Name, w.DurationMinutes, w.Notes, Volume(w), EstimateCalories(w, bodyWeightKg),
        w.Exercises.OrderBy(e => e.Position).Select(e => new WorkoutExerciseDto(
            e.ExerciseId, e.Exercise.Name, e.Exercise.Category, e.SupersetGroup, e.Notes,
            e.Sets.OrderBy(s => s.Position).Select(s => new SetDto(
                s.Reps, s.WeightKg, s.Rpe, s.Rir, s.RestSeconds, s.Tempo, s.DurationSeconds, s.DistanceM, s.AvgHeartRate, s.IsWarmup,
                s.IsWarmup ? null : Metrics.Estimated1Rm(s.WeightKg, s.Reps), Metrics.PaceSecPerKm(s.DurationSeconds, s.DistanceM))).ToList())).ToList(),
        w.StartTime, w.Type, w.TemplateId, w.PlanEntryId);

    /// <summary>Majority exercise category (ties: the earlier exercise wins); Sport and empty → Other.</summary>
    public static WorkoutType DeriveType(IEnumerable<ExerciseCategory> categories) =>
        categories.Select((c, i) => (c, i)).GroupBy(x => x.c)
            .OrderByDescending(g => g.Count()).ThenBy(g => g.Min(x => x.i))
            .Select(g => g.Key switch
            {
                ExerciseCategory.Strength => WorkoutType.Strength,
                ExerciseCategory.Cardio => WorkoutType.Cardio,
                ExerciseCategory.Mobility => WorkoutType.Mobility,
                _ => (WorkoutType?)WorkoutType.Other,
            }).FirstOrDefault() ?? WorkoutType.Other;

    /// <summary>
    /// The one write path for logged workouts (POST/PUT /workouts and session finish), so volume, calories and
    /// records are identical whichever flow produced them. Does not save; returns an error result or null.
    /// </summary>
    internal static async Task<IResult?> ApplyAsync(AppDbContext db, Guid userId, Workout w, WorkoutInput req, CancellationToken ct)
    {
        var known = await ResolveExercisesAsync(db, userId, req.Exercises.Select(e => e.ExerciseId), ct);
        if (req.Exercises.Any(e => !known.ContainsKey(e.ExerciseId))) return HttpExtensions.Invalid("exercises", "Unknown exercise.");
        // Reuse Exercise instances EF already tracks so it never sees two instances with one key.
        foreach (var tracked in w.Exercises.Select(e => e.Exercise)) known[tracked.Id] = tracked;
        if (req.TemplateId is { } templateId && !await db.Templates.AnyAsync(t => t.Id == templateId && t.UserId == userId, ct))
            return HttpExtensions.Invalid("templateId", "Unknown template.");

        PlanEntry? entry = null;
        if (req.PlanEntryId is { } planEntryId)
        {
            entry = await db.PlanEntries.SingleOrDefaultAsync(p => p.Id == planEntryId && p.UserId == userId, ct);
            if (entry is null) return HttpExtensions.Invalid("planEntryId", "Unknown plan entry.");
            if (entry.Status == PlanStatus.Completed && entry.WorkoutId != w.Id) return HttpExtensions.Conflict("This plan entry is already completed.");
        }
        // On update, an entry this workout no longer fulfils goes back to Planned.
        if (db.Entry(w).State != EntityState.Detached)
            foreach (var old in await db.PlanEntries.Where(p => p.UserId == userId && p.WorkoutId == w.Id && p.Id != req.PlanEntryId).ToListAsync(ct))
            {
                old.Status = PlanStatus.Planned;
                old.WorkoutId = null;
            }
        if (entry is not null)
        {
            entry.Status = PlanStatus.Completed;
            entry.WorkoutId = w.Id;
        }

        Apply(w, req, known, db);
        return null;
    }

    private static void Apply(Workout w, WorkoutInput req, Dictionary<Guid, Exercise> exercises, AppDbContext db)
    {
        w.Date = req.Date;
        w.Name = req.Name.Trim();
        w.DurationMinutes = req.DurationMinutes;
        w.Notes = req.Notes?.Trim();
        w.StartTime = req.StartTime;
        w.Type = req.Type ?? DeriveType(req.Exercises.Select(e => exercises[e.ExerciseId].Category));
        w.TemplateId = req.TemplateId;
        w.PlanEntryId = req.PlanEntryId;
        w.Exercises.Clear(); // orphans are deleted by EF (required relationship)
        foreach (var (e, i) in req.Exercises.Select((e, i) => (e, i)))
        {
            var exercise = exercises[e.ExerciseId];
            if (db.Entry(exercise).State == EntityState.Detached) db.Attach(exercise);
            w.Exercises.Add(new WorkoutExercise
            {
                Position = i,
                ExerciseId = e.ExerciseId,
                Exercise = exercise,
                SupersetGroup = e.SupersetGroup,
                Notes = e.Notes?.Trim(),
                Sets = e.Sets.Select((s, j) => new WorkoutSet
                {
                    Position = j, Reps = s.Reps, WeightKg = s.WeightKg, Rpe = s.Rpe, Rir = s.Rir, RestSeconds = s.RestSeconds,
                    Tempo = s.Tempo?.ToUpperInvariant(), DurationSeconds = s.DurationSeconds, DistanceM = s.DistanceM,
                    AvgHeartRate = s.AvgHeartRate, IsWarmup = s.IsWarmup,
                }).ToList(),
            });
        }
    }

    // 0.01 kg (the column's precision) * RepsPacking must exceed any rep count; reps are validated to <= 1000.
    private const decimal RepsPacking = 1_000_000m;

    public static async Task<List<PersonalRecordDto>> ComputeRecordsAsync(AppDbContext db, Guid userId, CancellationToken ct)
    {
        var sets = await (
            from w in db.Workouts
            where w.UserId == userId
            from we in w.Exercises
            where we.Exercise.Category == ExerciseCategory.Strength
            from s in we.Sets
            where !s.IsWarmup && s.WeightKg > 0 && s.Reps > 0
            // Epley, unrounded (see Metrics.Estimated1Rm); rounding is monotonic, so rounding the max later is equivalent.
            let e1Rm = s.Reps == 1 ? s.WeightKg : s.Reps <= 12 ? s.WeightKg * (1 + (decimal)s.Reps! / 30m) : null
            // One row per exercise per day instead of every set. WeightAndReps packs weight (2 decimals) and reps (< 10,000)
            // into one sortable number, so its max carries the most reps at that day's heaviest weight.
            group new { WeightKg = s.WeightKg!.Value, WeightAndReps = s.WeightKg!.Value * RepsPacking + s.Reps!.Value, E1Rm = e1Rm }
                by new { we.ExerciseId, we.Exercise.Name, w.Date } into g
            select new { g.Key.ExerciseId, g.Key.Name, g.Key.Date, WeightKg = g.Max(x => x.WeightKg), WeightAndReps = g.Max(x => x.WeightAndReps), E1Rm = g.Max(x => x.E1Rm) })
            .ToListAsync(ct);

        return sets.GroupBy(s => (s.ExerciseId, s.Name)).Select(g =>
        {
            var heaviest = g.OrderByDescending(s => s.WeightKg).ThenBy(s => s.Date).First();
            var best = g.Where(x => x.E1Rm is not null).Select(s => new { s.Date, E1Rm = (decimal?)Math.Round(s.E1Rm!.Value, 1) })
                .OrderByDescending(x => x.E1Rm).ThenBy(x => x.Date).FirstOrDefault();
            return new PersonalRecordDto(g.Key.ExerciseId, g.Key.Name, heaviest.WeightKg, heaviest.Date, best?.E1Rm, best?.Date,
                (int)(heaviest.WeightAndReps - heaviest.WeightKg * RepsPacking));
        }).OrderBy(r => r.ExerciseName).ToList();
    }

    private static TemplateDto MapTemplate(WorkoutTemplate t, IReadOnlyDictionary<Guid, Exercise> ex) => new(
        t.Id, t.Name, t.Description, t.Kind,
        t.Exercises.Select(i =>
        {
            var e = ex.GetValueOrDefault(i.ExerciseId);
            return new TemplateItemDto(i.ExerciseId, e?.Name ?? "Unknown", e?.Category ?? ExerciseCategory.Strength, i.Sets, i.Reps, i.WeightKg,
                i.TargetPercent1Rm, i.RestSeconds, i.Tempo, i.Rpe, i.Rir, i.Notes, i.Group, i.GroupType);
        }).ToList());

    private static void ApplyTemplate(WorkoutTemplate t, TemplateInput req)
    {
        t.Name = req.Name.Trim();
        t.Description = req.Description?.Trim();
        t.Kind = req.Kind;
        t.Exercises = req.Exercises.Select(i => new TemplateItem
        {
            ExerciseId = i.ExerciseId, Sets = i.Sets, Reps = i.Reps, WeightKg = i.TargetWeightKg, TargetPercent1Rm = i.TargetPercent1Rm,
            RestSeconds = i.RestSeconds, Tempo = i.Tempo?.ToUpperInvariant(), Rpe = i.Rpe, Rir = i.Rir, Notes = i.Notes?.Trim(),
            Group = i.Group, GroupType = i.GroupType,
        }).ToList();
    }

    public static void MapTraining(this RouteGroupBuilder api)
    {
        // Exercises
        var exercises = api.MapGroup("/exercises").WithTags("Exercises");

        exercises.MapGet("/", async (AppDbContext db, HttpContext ctx, CancellationToken ct) =>
            TypedResults.Ok((await db.Visible(ctx.User.UserId()).AsNoTracking().OrderBy(e => e.Name).ToListAsync(ct)).Select(ToDto)));

        exercises.MapPost("/", async (CreateExercise req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var e = new Exercise { UserId = ctx.User.UserId(), Name = req.Name.Trim(), Category = req.Category, PrimaryMuscle = req.PrimaryMuscle?.Trim(), Met = req.Met };
            db.Exercises.Add(e);
            await db.SaveChangesAsync(ct);
            return TypedResults.Created($"/api/exercises/{e.Id}", ToDto(e));
        }).Validate<CreateExercise>();

        exercises.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var e = await db.Exercises.SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
            if (e is null) return HttpExtensions.NotFound();
            var usedInWorkout = await db.Workouts.AnyAsync(w => w.UserId == userId && w.Exercises.Any(x => x.ExerciseId == id), ct);
            var templates = await db.Templates.AsNoTracking().Where(t => t.UserId == userId).ToListAsync(ct);
            if (usedInWorkout || templates.Any(t => t.Exercises.Any(i => i.ExerciseId == id)))
                return HttpExtensions.Conflict("This exercise is used in a workout or template.");
            db.Exercises.Remove(e);
            await db.SaveChangesAsync(ct);
            return TypedResults.NoContent();
        });

        // Workouts
        var workouts = api.MapGroup("/workouts").WithTags("Workouts");

        workouts.MapGet("/", async (DateOnly? from, DateOnly? to, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            var end = to ?? clock.Today(u.TimeZone).AddDays(1);
            var start = from ?? end.AddDays(-366);
            var bw = (await db.LatestWeightAsync(u.Id, ct))?.WeightKg;
            // Aggregated in SQL: a summary list never needs the set rows themselves.
            var rows = await db.Workouts.AsNoTracking()
                .Where(w => w.UserId == u.Id && w.Date >= start && w.Date <= end)
                .OrderByDescending(w => w.Date).ThenByDescending(w => w.CreatedAt)
                .Select(w => new
                {
                    w.Id, w.Date, w.Name, w.DurationMinutes, w.StartTime, w.Type, w.TemplateId, w.PlanEntryId,
                    ExerciseCount = w.Exercises.Count,
                    SetCount = w.Exercises.SelectMany(e => e.Sets).Count(),
                    Volume = w.Exercises.SelectMany(e => e.Sets)
                        .Where(s => !s.IsWarmup && s.WeightKg > 0 && s.Reps > 0)
                        .Sum(s => s.WeightKg!.Value * s.Reps!.Value),
                    Parts = w.Exercises.Select(e => new { e.Exercise.Met, Seconds = e.Sets.Sum(s => s.DurationSeconds ?? 0) }).ToList(),
                }).ToListAsync(ct);
            return TypedResults.Ok(rows.Select(w => new WorkoutSummaryDto(
                w.Id, w.Date, w.Name, w.DurationMinutes, w.ExerciseCount, w.SetCount, w.Volume,
                EstimateCalories(w.DurationMinutes, w.Parts.Select(p => (p.Met, p.Seconds)), bw),
                w.StartTime, w.Type, w.TemplateId, w.PlanEntryId)));
        });

        workouts.MapGet("/{id:guid}", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var w = await db.Workouts.AsNoTracking().WithGraph().SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
            return w is null ? HttpExtensions.NotFound() : TypedResults.Ok(ToDto(w, (await db.LatestWeightAsync(userId, ct))?.WeightKg));
        });

        workouts.MapPost("/", async (WorkoutInput req, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var w = new Workout { UserId = userId, CreatedAt = clock.GetUtcNow().UtcDateTime };
            if (await ApplyAsync(db, userId, w, req, ct) is { } error) return error;
            db.Workouts.Add(w);
            await db.SaveChangesAsync(ct);
            return TypedResults.Created($"/api/workouts/{w.Id}", ToDto(w, (await db.LatestWeightAsync(userId, ct))?.WeightKg));
        }).Validate<WorkoutInput>();

        workouts.MapPut("/{id:guid}", async (Guid id, WorkoutInput req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var w = await db.Workouts.WithGraph().SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
            if (w is null) return HttpExtensions.NotFound();
            if (await ApplyAsync(db, userId, w, req, ct) is { } error) return error;
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(ToDto(w, (await db.LatestWeightAsync(userId, ct))?.WeightKg));
        }).Validate<WorkoutInput>();

        workouts.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            // The plan entry it completed becomes Planned again (the FK clears WorkoutId).
            await db.PlanEntries.Where(p => p.WorkoutId == id && p.UserId == userId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, PlanStatus.Planned), ct);
            var deleted = await db.Workouts.Where(w => w.Id == id && w.UserId == userId).ExecuteDeleteAsync(ct);
            return deleted == 0 ? HttpExtensions.NotFound() : TypedResults.NoContent();
        });

        // Templates
        var templates = api.MapGroup("/templates").WithTags("Templates");

        templates.MapGet("/", async (AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var rows = await db.Templates.AsNoTracking().Where(t => t.UserId == userId).OrderBy(t => t.Name).ToListAsync(ct);
            var ex = await ResolveExercisesAsync(db, userId, rows.SelectMany(t => t.Exercises).Select(i => i.ExerciseId), ct);
            return TypedResults.Ok(rows.Select(t => MapTemplate(t, ex)));
        });

        templates.MapPost("/", async (TemplateInput req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var ex = await ResolveExercisesAsync(db, userId, req.Exercises.Select(i => i.ExerciseId), ct);
            if (req.Exercises.Any(i => !ex.ContainsKey(i.ExerciseId))) return HttpExtensions.Invalid("exercises", "Unknown exercise.");
            var t = new WorkoutTemplate { UserId = userId };
            ApplyTemplate(t, req);
            db.Templates.Add(t);
            await db.SaveChangesAsync(ct);
            return TypedResults.Created($"/api/templates/{t.Id}", MapTemplate(t, ex));
        }).Validate<TemplateInput>();

        templates.MapPut("/{id:guid}", async (Guid id, TemplateInput req, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var t = await db.Templates.SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
            if (t is null) return HttpExtensions.NotFound();
            var ex = await ResolveExercisesAsync(db, userId, req.Exercises.Select(i => i.ExerciseId), ct);
            if (req.Exercises.Any(i => !ex.ContainsKey(i.ExerciseId))) return HttpExtensions.Invalid("exercises", "Unknown exercise.");
            ApplyTemplate(t, req);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(MapTemplate(t, ex));
        }).Validate<TemplateInput>();

        templates.MapPost("/{id:guid}/duplicate", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var src = await db.Templates.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
            if (src is null) return HttpExtensions.NotFound();
            const string suffix = " (copy)";
            var t = new WorkoutTemplate
            {
                UserId = userId,
                Name = src.Name[..Math.Min(src.Name.Length, 100 - suffix.Length)] + suffix,
                Description = src.Description,
                Kind = src.Kind,
                Exercises = src.Exercises, // fresh untracked instances from AsNoTracking
            };
            db.Templates.Add(t);
            await db.SaveChangesAsync(ct);
            var ex = await ResolveExercisesAsync(db, userId, t.Exercises.Select(i => i.ExerciseId), ct);
            return TypedResults.Created($"/api/templates/{t.Id}", MapTemplate(t, ex));
        });

        templates.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            // Upcoming (not completed) plan entries go with it; history keeps a null TemplateId via the FK.
            await db.PlanEntries.Where(p => p.TemplateId == id && p.UserId == userId && p.Status != PlanStatus.Completed).ExecuteDeleteAsync(ct);
            var deleted = await db.Templates.Where(t => t.Id == id && t.UserId == userId).ExecuteDeleteAsync(ct);
            return deleted == 0 ? HttpExtensions.NotFound() : TypedResults.NoContent();
        });

        // Personal records
        api.MapGet("/records", async (AppDbContext db, HttpContext ctx, CancellationToken ct) =>
            TypedResults.Ok(await ComputeRecordsAsync(db, ctx.User.UserId(), ct))).WithTags("Records");
    }
}
