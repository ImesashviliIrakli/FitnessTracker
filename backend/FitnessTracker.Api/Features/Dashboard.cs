using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Features;

public sealed record WeightPoint(DateOnly Date, decimal WeightKg, decimal TrendKg);
public sealed record WeightSummary(
    decimal? LatestKg, DateOnly? LatestDate, decimal? Change30dKg, decimal? Avg7dKg, decimal? Bmi, decimal? BodyFatPercent, List<WeightPoint> Series);
public sealed record GoalSummary(GoalMode Mode, decimal? TargetWeightKg, decimal? StartWeightKg, decimal? ProgressPercent, DateOnly? ProjectedDate,
    DateOnly? TargetDate, bool? TargetDateFeasible, decimal? RequiredWeeklyRateKg);
public sealed record WeekPoint(DateOnly WeekStart, int Workouts, decimal VolumeKg);
public sealed record TrainingSummary(
    int WorkoutsThisWeek, int WeeklyTarget, int WeekStreak, int TotalWorkouts, List<WeekPoint> Weeks,
    decimal? AvgExerciseKcalPerDay, int PlannedThisWeek, int CompletedPlannedThisWeek);
public sealed record RecentRecord(Guid ExerciseId, string ExerciseName, decimal WeightKg, int Reps, decimal? Estimated1Rm, DateOnly Date);
public sealed record DashboardDto(
    WeightSummary Weight, GoalSummary Goal, TrainingSummary Training, List<RecentRecord> RecentRecords, CalorieResult? Calories, PlanEntryDto? NextPlan);

public static class DashboardEndpoints
{
    public static void MapDashboard(this RouteGroupBuilder api) =>
        api.MapGet("/dashboard", GetAsync).WithTags("Dashboard");

    private static async Task<IResult> GetAsync(AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct)
    {
        var u = await db.CurrentUserAsync(ctx.User, ct);
        var today = clock.Today(u.TimeZone);
        var latest = await db.LatestWeightAsync(u.Id, ct);

        // Weight: 180 days feeds the trend so the first of the 90 displayed days is already smoothed.
        var weights = await db.Weights.AsNoTracking()
            .Where(w => w.UserId == u.Id && w.Date >= today.AddDays(-180))
            .OrderBy(w => w.Date).ToListAsync(ct);
        var trend = Metrics.Trend(weights.Select(w => w.WeightKg).ToList());
        var series = weights.Select((w, i) => new WeightPoint(w.Date, w.WeightKg, trend[i]))
            .Where(p => p.Date >= today.AddDays(-90)).ToList();

        decimal? change30 = null, avg7 = null;
        if (latest is not null)
        {
            var baseline = weights.FirstOrDefault(w => w.Date >= latest.Date.AddDays(-30));
            if (baseline is not null && baseline.Id != latest.Id) change30 = latest.WeightKg - baseline.WeightKg;
            var lastWeek = weights.Where(w => w.Date > latest.Date.AddDays(-7)).ToList();
            if (lastWeek.Count > 0) avg7 = Math.Round(lastWeek.Average(w => w.WeightKg), 2);
        }
        var weight = new WeightSummary(
            latest?.WeightKg, latest?.Date, change30, avg7,
            latest is null ? null : Metrics.Bmi(latest.WeightKg, u.HeightCm),
            weights.LastOrDefault(w => w.BodyFatPercent is not null)?.BodyFatPercent,
            series);

        // Burned calories of the last 28 days, same MET estimate as the workout list; null without a bodyweight.
        decimal? avgExerciseKcal = null;
        if (latest is not null)
        {
            var last28 = await db.Workouts.AsNoTracking()
                .Where(w => w.UserId == u.Id && w.Date > today.AddDays(-28) && w.Date <= today)
                .Select(w => new { w.DurationMinutes, Parts = w.Exercises.Select(e => new { e.Exercise.Met, Seconds = e.Sets.Sum(s => s.DurationSeconds ?? 0) }).ToList() })
                .ToListAsync(ct);
            avgExerciseKcal = Math.Round(last28.Sum(w =>
                TrainingEndpoints.EstimateCalories(w.DurationMinutes, w.Parts.Select(p => (p.Met, p.Seconds)), latest.WeightKg) ?? 0) / 28m);
        }

        // Calories + goal
        var calorieInput = CalorieCalculator.FromProfile(u, latest, today, avgExerciseKcal);
        var calories = calorieInput is null ? null : CalorieCalculator.Calculate(calorieInput, today);

        // A target on the wrong side of the current weight has no meaningful progress or projection.
        var contradictory = latest is not null && u.TargetWeightKg is { } goalKg
            && (u.GoalMode == GoalMode.Lose && goalKg > latest.WeightKg || u.GoalMode == GoalMode.Gain && goalKg < latest.WeightKg);
        decimal? progress = null;
        DateOnly? projected = null;
        decimal? requiredRate = null;
        if (!contradictory)
        {
            if (u is { GoalStartWeightKg: { } start, TargetWeightKg: { } target } && latest is not null && start != target)
                progress = Math.Round(Math.Clamp((start - latest.WeightKg) / (start - target) * 100m, 0, 100));
            if (u.GoalMode != GoalMode.Maintain)
            {
                projected = calories?.ProjectedDate;
                if (projected is null && u is { TargetWeightKg: { } t, WeeklyRateKg: > 0 } && latest is not null)
                    projected = today.AddDays((int)Math.Ceiling(Math.Abs(latest.WeightKg - t) / u.WeeklyRateKg * 7));
                if (u is { TargetDate: { } due, TargetWeightKg: { } t2 } && latest is not null && due > today)
                    requiredRate = Math.Round(Math.Abs(latest.WeightKg - t2) / ((due.DayNumber - today.DayNumber) / 7m) * 20m) / 20m;
            }
        }
        bool? feasible = u.TargetDate is { } targetDate && projected is { } p ? p <= targetDate : null;
        var goal = new GoalSummary(u.GoalMode, u.TargetWeightKg, u.GoalStartWeightKg, progress, projected, u.TargetDate, feasible, requiredRate);

        // Training
        var since = Metrics.WeekStart(today).AddDays(-7 * 11);
        var recent = await db.Workouts.AsNoTracking()
            .Where(w => w.UserId == u.Id && w.Date >= since)
            .Select(w => new
            {
                w.Date,
                Volume = w.Exercises.SelectMany(e => e.Sets)
                    .Where(s => !s.IsWarmup && s.WeightKg > 0 && s.Reps > 0)
                    .Sum(s => s.WeightKg!.Value * s.Reps!.Value),
            }).ToListAsync(ct);
        var streakDates = await db.Workouts.AsNoTracking()
            .Where(w => w.UserId == u.Id && w.Date >= today.AddYears(-2)).Select(w => w.Date).ToListAsync(ct);
        var total = await db.Workouts.CountAsync(w => w.UserId == u.Id, ct);
        var weeks = Enumerable.Range(0, 12).Select(i =>
        {
            var ws = since.AddDays(7 * i);
            var inWeek = recent.Where(r => r.Date >= ws && r.Date < ws.AddDays(7)).ToList();
            return new WeekPoint(ws, inWeek.Count, inWeek.Sum(r => r.Volume));
        }).ToList();
        var weekStart = Metrics.WeekStart(today);
        var plannedWeek = await db.PlanEntries.AsNoTracking()
            .Where(p => p.UserId == u.Id && p.Date >= weekStart && p.Date < weekStart.AddDays(7) && p.Status != PlanStatus.Skipped
                        && (p.Template == null || p.Template.Kind == TemplateKind.Workout))
            .Select(p => p.Status).ToListAsync(ct);
        var training = new TrainingSummary(
            weeks[^1].Workouts, u.WeeklyWorkoutTarget, Metrics.WeekStreak(streakDates, today, u.WeeklyWorkoutTarget), total, weeks,
            avgExerciseKcal, plannedWeek.Count, plannedWeek.Count(s => s == PlanStatus.Completed));

        var records = (await TrainingEndpoints.ComputeRecordsAsync(db, u.Id, ct))
            .Select(r => new RecentRecord(r.ExerciseId, r.ExerciseName, r.BestWeightKg, r.BestWeightReps, r.Best1Rm,
                r.Best1RmDate is { } d && d > r.BestWeightDate ? d : r.BestWeightDate))
            .OrderByDescending(r => r.Date).Take(5).ToList();

        return TypedResults.Ok(new DashboardDto(weight, goal, training, records, calories, await PlanEndpoints.NextAsync(db, u.Id, today, ct)));
    }
}
