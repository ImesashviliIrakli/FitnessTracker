using System.Text.Json;
using System.Text.Json.Serialization;
using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Features;

// ---- Contracts ----

public sealed record SessionSet(
    string Id, int? TargetReps, decimal? TargetWeightKg, decimal? TargetRpe,
    int? Reps, decimal? WeightKg, decimal? Rpe, int? Rir, int? DurationSeconds, decimal? DistanceM,
    bool IsWarmup, bool Done);
public sealed record SessionExercise(
    string Id, Guid ExerciseId, string? ExerciseName, ExerciseCategory Category,
    int? RestSeconds, string? Tempo, string? Notes, int? Group, GroupType? GroupType,
    bool Skipped, List<SessionSet> Sets);
public sealed record SessionDto(
    Guid Id, string Name, DateTime StartedAt, Guid? TemplateId, Guid? PlanEntryId, string? Notes, List<SessionExercise> Exercises, DateTime UpdatedAt);

public sealed record StartSession(Guid? PlanEntryId, Guid? TemplateId, string? Name);
public sealed record SessionInput(string Name, string? Notes, List<SessionExercise> Exercises);
public sealed record LogSetInput(
    string ExerciseId, string SetId, int? Reps, decimal? WeightKg, decimal? Rpe, int? Rir, int? DurationSeconds, decimal? DistanceM, bool Done);
public sealed record FinishSession(string? Notes, int? DurationMinutes);

public sealed record SessionPr(Guid ExerciseId, string ExerciseName, string Kind, decimal Value, decimal? Previous); // Kind: Weight | E1rm
public sealed record SessionSummary(
    WorkoutDto Workout, int DurationMinutes, int SetsDone, decimal TotalVolumeKg, decimal? EstimatedCalories,
    List<SessionPr> Prs, int WeekStreak, int WorkoutsThisWeek, int WeeklyTarget, PlanEntryDto? NextPlan);

// ---- Validation ----

public sealed class StartSessionValidator : AbstractValidator<StartSession>
{
    public StartSessionValidator() => RuleFor(x => x.Name).MaximumLength(100);
}

public sealed class SessionInputValidator : AbstractValidator<SessionInput>
{
    public SessionInputValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Notes).MaximumLength(2000);
        RuleFor(x => x.Exercises).NotNull()
            .Must(e => e.Count <= 50).WithMessage("A session can have at most 50 exercises.")
            .Must(e => e.Select(x => x.Id).Distinct().Count() == e.Count).WithMessage("Exercise ids must be unique.");
        RuleForEach(x => x.Exercises).ChildRules(e =>
        {
            e.RuleFor(x => x.Id).NotEmpty().MaximumLength(64);
            e.RuleFor(x => x.ExerciseId).NotEmpty();
            e.RuleFor(x => x.RestSeconds).InclusiveBetween(0, 3600);
            e.RuleFor(x => x.Tempo).Matches(WorkoutInputValidator.TempoPattern).WithMessage("Tempo looks like 3-1-1-0.");
            e.RuleFor(x => x.Notes).MaximumLength(500);
            e.RuleFor(x => x.Group).InclusiveBetween(1, 20);
            e.RuleFor(x => x.GroupType).IsInEnum();
            e.RuleFor(x => x.Sets).NotNull()
                .Must(s => s.Count <= 50).WithMessage("An exercise can have at most 50 sets.")
                .Must(s => s.Select(x => x.Id).Distinct().Count() == s.Count).WithMessage("Set ids must be unique.");
            e.RuleForEach(x => x.Sets).ChildRules(s =>
            {
                s.RuleFor(x => x.Id).NotEmpty().MaximumLength(64);
                s.RuleFor(x => x.TargetReps).InclusiveBetween(0, 1000);
                s.RuleFor(x => x.TargetWeightKg).InclusiveBetween(0, 1000);
                s.RuleFor(x => x.TargetRpe).InclusiveBetween(1, 10);
                s.RuleFor(x => x.Reps).InclusiveBetween(0, 1000);
                s.RuleFor(x => x.WeightKg).InclusiveBetween(0, 1000);
                s.RuleFor(x => x.Rpe).InclusiveBetween(1, 10);
                s.RuleFor(x => x.Rir).InclusiveBetween(0, 10);
                s.RuleFor(x => x.DurationSeconds).InclusiveBetween(0, 86_400);
                s.RuleFor(x => x.DistanceM).InclusiveBetween(0, 1_000_000);
            });
        });
    }
}

public sealed class LogSetInputValidator : AbstractValidator<LogSetInput>
{
    public LogSetInputValidator()
    {
        RuleFor(x => x.ExerciseId).NotEmpty().MaximumLength(64);
        RuleFor(x => x.SetId).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Reps).InclusiveBetween(0, 1000);
        RuleFor(x => x.WeightKg).InclusiveBetween(0, 1000);
        RuleFor(x => x.Rpe).InclusiveBetween(1, 10);
        RuleFor(x => x.Rir).InclusiveBetween(0, 10);
        RuleFor(x => x.DurationSeconds).InclusiveBetween(0, 86_400);
        RuleFor(x => x.DistanceM).InclusiveBetween(0, 1_000_000);
    }
}

public sealed class FinishSessionValidator : AbstractValidator<FinishSession>
{
    public FinishSessionValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(2000);
        RuleFor(x => x.DurationMinutes).InclusiveBetween(1, 1440);
    }
}

// ---- Endpoints ----

public static class SessionEndpoints
{
    private static readonly JsonSerializerOptions Doc = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private static List<SessionExercise> Read(WorkoutSession s) => JsonSerializer.Deserialize<List<SessionExercise>>(s.ExercisesJson, Doc) ?? [];
    private static string Write(List<SessionExercise> exercises) => JsonSerializer.Serialize(exercises, Doc);
    private static string NewId() => Guid.NewGuid().ToString();

    private static SessionDto ToDto(WorkoutSession s) =>
        new(s.Id, s.Name, s.StartedAt, s.TemplateId, s.PlanEntryId, s.Notes, Read(s), s.UpdatedAt);

    /// <summary>
    /// Template items → session exercises. Target weight: explicit, else %1RM of the best e1RM (rounded to 2.5 kg),
    /// else the last logged working-set weight of that exercise, else null.
    /// </summary>
    private static async Task<List<SessionExercise>> FromTemplateAsync(AppDbContext db, Guid userId, WorkoutTemplate t, CancellationToken ct)
    {
        var ex = await TrainingEndpoints.ResolveExercisesAsync(db, userId, t.Exercises.Select(i => i.ExerciseId), ct);

        var best = t.Exercises.Any(i => i.WeightKg is null && i.TargetPercent1Rm is not null)
            ? (await TrainingEndpoints.ComputeRecordsAsync(db, userId, ct)).Where(r => r.Best1Rm is not null).ToDictionary(r => r.ExerciseId, r => r.Best1Rm!.Value)
            : [];

        var needLast = t.Exercises.Where(i => i.WeightKg is null).Select(i => i.ExerciseId).Distinct().ToList();
        var last = needLast.Count == 0 ? [] : (await (
                from w in db.Workouts
                where w.UserId == userId
                from we in w.Exercises
                where needLast.Contains(we.ExerciseId)
                from s in we.Sets
                where !s.IsWarmup && s.WeightKg > 0
                select new { we.ExerciseId, w.Date, w.CreatedAt, ExercisePosition = we.Position, s.Position, WeightKg = s.WeightKg!.Value })
            .GroupBy(x => x.ExerciseId)
            .Select(g => g.OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt)
                .ThenByDescending(x => x.ExercisePosition).ThenByDescending(x => x.Position).First())
            .ToListAsync(ct)).ToDictionary(x => x.ExerciseId, x => (decimal?)x.WeightKg);

        return t.Exercises.Where(i => ex.ContainsKey(i.ExerciseId)).Select(i =>
        {
            var e = ex[i.ExerciseId];
            var target = i.WeightKg
                ?? (i.TargetPercent1Rm is { } pct && best.TryGetValue(i.ExerciseId, out var oneRm) ? Metrics.RoundTo(pct / 100m * oneRm, 2.5m) : (decimal?)null)
                ?? last.GetValueOrDefault(i.ExerciseId);
            return new SessionExercise(NewId(), e.Id, e.Name, e.Category, i.RestSeconds, i.Tempo, i.Notes, i.Group, i.GroupType, false,
                Enumerable.Range(0, i.Sets).Select(_ => new SessionSet(NewId(), i.Reps, target, i.Rpe, null, null, null, null, null, null, false, false)).ToList());
        }).ToList();
    }

    public static void MapSessions(this RouteGroupBuilder api)
    {
        var sessions = api.MapGroup("/sessions").WithTags("Sessions");

        sessions.MapPost("/", async (StartSession req, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var existing = await db.Sessions.AsNoTracking().SingleOrDefaultAsync(s => s.UserId == userId, ct);
            if (existing is not null) return TypedResults.Conflict(ToDto(existing));

            WorkoutTemplate? template = null;
            if (req.PlanEntryId is { } planEntryId)
            {
                var entry = await db.PlanEntries.AsNoTracking().Include(p => p.Template).SingleOrDefaultAsync(p => p.Id == planEntryId && p.UserId == userId, ct);
                if (entry is null) return HttpExtensions.Invalid("planEntryId", "Unknown plan entry.");
                if (entry is not { Status: PlanStatus.Planned, Template.Kind: TemplateKind.Workout })
                    return HttpExtensions.Invalid("planEntryId", "Only a planned workout day can be started.");
                template = entry.Template;
            }
            else if (req.TemplateId is { } templateId)
            {
                template = await db.Templates.AsNoTracking().SingleOrDefaultAsync(t => t.Id == templateId && t.UserId == userId, ct);
                if (template is null) return HttpExtensions.Invalid("templateId", "Unknown template.");
                if (template.Kind == TemplateKind.RestDay) return HttpExtensions.Invalid("templateId", "A rest day has no exercises to start.");
            }

            var now = clock.GetUtcNow().UtcDateTime;
            var s = new WorkoutSession
            {
                UserId = userId,
                Name = string.IsNullOrWhiteSpace(req.Name) ? template?.Name ?? "Workout" : req.Name.Trim(),
                StartedAt = now,
                UpdatedAt = now,
                TemplateId = template?.Id,
                PlanEntryId = req.PlanEntryId,
                ExercisesJson = Write(template is null ? [] : await FromTemplateAsync(db, userId, template, ct)),
            };
            db.Sessions.Add(s);
            await db.SaveChangesAsync(ct); // unique index on UserId turns a concurrent double start into 409
            return TypedResults.Created($"/api/sessions/{s.Id}", ToDto(s));
        }).Validate<StartSession>();

        sessions.MapGet("/active", async (AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var s = await db.Sessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct);
            return s is null ? (IResult)TypedResults.NoContent() : TypedResults.Ok(ToDto(s));
        });

        sessions.MapPut("/{id:guid}", async (Guid id, SessionInput req, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var s = await db.Sessions.SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
            if (s is null) return HttpExtensions.NotFound();
            var ex = await TrainingEndpoints.ResolveExercisesAsync(db, userId, req.Exercises.Select(e => e.ExerciseId), ct);
            if (req.Exercises.Any(e => !ex.ContainsKey(e.ExerciseId))) return HttpExtensions.Invalid("exercises", "Unknown exercise.");
            s.Name = req.Name.Trim();
            s.Notes = req.Notes?.Trim();
            s.ExercisesJson = Write(req.Exercises.Select(e => e with
            {
                ExerciseName = ex[e.ExerciseId].Name, Category = ex[e.ExerciseId].Category, Tempo = e.Tempo?.ToUpperInvariant(),
            }).ToList());
            s.UpdatedAt = clock.GetUtcNow().UtcDateTime;
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(ToDto(s));
        }).Validate<SessionInput>();

        sessions.MapPost("/{id:guid}/log", async (Guid id, LogSetInput req, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.UserId();
            var s = await db.Sessions.SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
            if (s is null) return HttpExtensions.NotFound();
            var exercises = Read(s);
            var exercise = exercises.FirstOrDefault(e => e.Id == req.ExerciseId);
            var i = exercise?.Sets.FindIndex(x => x.Id == req.SetId) ?? -1;
            if (exercise is null || i < 0) return HttpExtensions.NotFound();
            exercise.Sets[i] = exercise.Sets[i] with
            {
                Reps = req.Reps, WeightKg = req.WeightKg, Rpe = req.Rpe, Rir = req.Rir,
                DurationSeconds = req.DurationSeconds, DistanceM = req.DistanceM, Done = req.Done,
            };
            s.ExercisesJson = Write(exercises);
            s.UpdatedAt = clock.GetUtcNow().UtcDateTime;
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(ToDto(s));
        }).Validate<LogSetInput>();

        sessions.MapPost("/{id:guid}/finish", async (Guid id, FinishSession req, AppDbContext db, HttpContext ctx, TimeProvider clock,
            IValidator<WorkoutInput> workoutValidator, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            var s = await db.Sessions.SingleOrDefaultAsync(x => x.Id == id && x.UserId == u.Id, ct);
            if (s is null) return HttpExtensions.NotFound();

            var logged = Read(s).Where(e => !e.Skipped)
                .Select(e => (Exercise: e, Sets: e.Sets.Where(x => x.Done).ToList()))
                .Where(x => x.Sets.Count > 0).ToList();
            if (logged.Count == 0)
            {
                const string message = "Log at least one set before finishing.";
                return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["exercises"] = [message] }, detail: message);
            }

            var now = clock.GetUtcNow().UtcDateTime;
            var local = HttpExtensions.ToLocal(s.StartedAt, u.TimeZone);
            var duration = req.DurationMinutes ?? Math.Clamp((int)Math.Round((now - s.StartedAt).TotalMinutes), 1, 1440);
            // Someone may have logged that plan entry manually meanwhile; then this workout just isn't linked to it.
            var planEntryId = s.PlanEntryId is { } pid && await db.PlanEntries.AnyAsync(p => p.Id == pid && p.Status != PlanStatus.Completed, ct) ? pid : (Guid?)null;
            var input = new WorkoutInput(
                DateOnly.FromDateTime(local), s.Name, duration, req.Notes ?? s.Notes,
                logged.Select(x => new WorkoutExerciseInput(x.Exercise.ExerciseId, x.Exercise.Group, x.Exercise.Notes,
                    x.Sets.Select(st => new SetInput(
                        st.Reps ?? st.TargetReps, st.WeightKg ?? st.TargetWeightKg, st.Rpe ?? st.TargetRpe, st.Rir,
                        x.Exercise.RestSeconds, x.Exercise.Tempo, st.DurationSeconds, st.DistanceM, null, st.IsWarmup)).ToList())).ToList(),
                new TimeOnly(local.Hour, local.Minute), null, s.TemplateId, planEntryId);
            var validation = await workoutValidator.ValidateAsync(input, ct);
            if (!validation.IsValid) return TypedResults.ValidationProblem(validation.ToDictionary());

            var before = (await TrainingEndpoints.ComputeRecordsAsync(db, u.Id, ct)).ToDictionary(r => r.ExerciseId);

            var w = new Workout { UserId = u.Id, CreatedAt = now };
            if (await TrainingEndpoints.ApplyAsync(db, u.Id, w, input, ct) is { } error) return error;
            db.Workouts.Add(w);
            db.Sessions.Remove(s);
            await db.SaveChangesAsync(ct);

            var dto = TrainingEndpoints.ToDto(w, (await db.LatestWeightAsync(u.Id, ct))?.WeightKg);

            var prs = new List<SessionPr>();
            foreach (var g in dto.Exercises.Where(e => e.Category == ExerciseCategory.Strength).GroupBy(e => (e.ExerciseId, e.ExerciseName)))
            {
                var sets = g.SelectMany(e => e.Sets).Where(x => !x.IsWarmup && x.WeightKg > 0 && x.Reps > 0).ToList();
                if (sets.Count == 0) continue;
                var prev = before.GetValueOrDefault(g.Key.ExerciseId);
                var weight = sets.Max(x => x.WeightKg!.Value);
                if (prev is null || weight > prev.BestWeightKg) prs.Add(new(g.Key.ExerciseId, g.Key.ExerciseName, "Weight", weight, prev?.BestWeightKg));
                if (sets.Max(x => x.Estimated1Rm) is { } e1Rm && (prev?.Best1Rm is not { } prevE1Rm || e1Rm > prevE1Rm))
                    prs.Add(new(g.Key.ExerciseId, g.Key.ExerciseName, "E1rm", e1Rm, prev?.Best1Rm));
            }

            var today = clock.Today(u.TimeZone);
            var dates = await db.Workouts.AsNoTracking().Where(x => x.UserId == u.Id && x.Date >= today.AddYears(-2)).Select(x => x.Date).ToListAsync(ct);
            var weekStart = Metrics.WeekStart(today);

            return TypedResults.Created($"/api/workouts/{w.Id}", new SessionSummary(
                dto, duration, logged.Sum(x => x.Sets.Count), dto.TotalVolumeKg, dto.EstimatedCalories, prs,
                Metrics.WeekStreak(dates, today, u.WeeklyWorkoutTarget), dates.Count(d => d >= weekStart && d < weekStart.AddDays(7)),
                u.WeeklyWorkoutTarget, await PlanEndpoints.NextAsync(db, u.Id, today, ct)));
        }).Validate<FinishSession>();

        sessions.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, HttpContext ctx, CancellationToken ct) =>
        {
            var deleted = await db.Sessions.Where(s => s.Id == id && s.UserId == ctx.User.UserId()).ExecuteDeleteAsync(ct);
            return deleted == 0 ? HttpExtensions.NotFound() : TypedResults.NoContent();
        });
    }
}
