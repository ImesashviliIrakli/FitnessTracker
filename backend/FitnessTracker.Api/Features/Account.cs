using System.Text.Json;
using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FitnessTracker.Api.Features;

public sealed record DeleteAccountRequest(string Password);

public static class AccountEndpoints
{
    public static void MapAccount(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/account").WithTags("Account");

        g.MapGet("/export", async (AppDbContext db, HttpContext ctx, TimeProvider clock, IOptions<JsonOptions> json, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            var today = clock.Today(u.TimeZone);
            var workouts = await db.Workouts.AsNoTracking()
                .Include(w => w.Exercises).ThenInclude(e => e.Sets)
                .Include(w => w.Exercises).ThenInclude(e => e.Exercise)
                .AsSplitQuery()
                .Where(w => w.UserId == u.Id).OrderBy(w => w.Date).ToListAsync(ct);

            var export = new
            {
                exportedAt = clock.GetUtcNow(),
                units = "metric (kg, cm, m, s)",
                profile = u.ToDto(today),
                goal = u.ToGoal(),
                weights = await db.Weights.AsNoTracking().Where(x => x.UserId == u.Id).OrderBy(x => x.Date)
                    .Select(x => new { x.Date, x.WeightKg, x.BodyFatPercent, x.Note }).ToListAsync(ct),
                measurements = await db.Measurements.AsNoTracking().Where(x => x.UserId == u.Id).OrderBy(x => x.Date)
                    .Select(x => new { x.Date, x.WaistCm, x.ChestCm, x.HipsCm, x.ArmCm, x.ThighCm, x.NeckCm, x.ShouldersCm, x.Note }).ToListAsync(ct),
                daily = await db.DailyLogs.AsNoTracking().Where(x => x.UserId == u.Id).OrderBy(x => x.Date)
                    .Select(x => new { x.Date, x.Steps, x.SleepHours, x.RestingHeartRate, x.Energy, x.Soreness, x.Mood, x.Note }).ToListAsync(ct),
                exercises = await db.Exercises.AsNoTracking().Where(x => x.UserId == u.Id)
                    .Select(x => new { x.Id, x.Name, x.Category, x.PrimaryMuscle, x.Met }).ToListAsync(ct),
                workouts = workouts.Select(w => new
                {
                    w.Id, w.Date, w.StartTime, w.Name, w.Type, w.DurationMinutes, w.Notes, w.TemplateId, w.PlanEntryId,
                    exercises = w.Exercises.OrderBy(e => e.Position).Select(e => new
                    {
                        e.ExerciseId, exercise = e.Exercise.Name, e.SupersetGroup, e.Notes,
                        sets = e.Sets.OrderBy(s => s.Position).Select(s => new
                        {
                            s.Reps, s.WeightKg, s.Rpe, s.Rir, s.RestSeconds, s.Tempo, s.DurationSeconds, s.DistanceM, s.AvgHeartRate, s.IsWarmup,
                        }),
                    }),
                }),
                templates = await db.Templates.AsNoTracking().Where(x => x.UserId == u.Id)
                    .Select(x => new { x.Id, x.Name, x.Description, x.Kind, x.Exercises }).ToListAsync(ct),
                plan = await db.PlanEntries.AsNoTracking().Where(x => x.UserId == u.Id).OrderBy(x => x.Date)
                    .Select(x => new { x.Date, x.TemplateId, x.Status, x.WorkoutId, x.SeriesId, x.Note }).ToListAsync(ct),
            };

            var bytes = JsonSerializer.SerializeToUtf8Bytes(export, json.Value.SerializerOptions);
            return Results.File(bytes, "application/json", $"fittrack-export-{today:yyyy-MM-dd}.json");
        });

        g.MapPost("/delete", async (DeleteAccountRequest req, AppDbContext db, UserManager<AppUser> users, SignInManager<AppUser> signIn, HttpContext ctx) =>
        {
            var user = await users.GetUserAsync(ctx.User);
            if (user is null) return Results.Unauthorized();
            if (string.IsNullOrEmpty(req.Password) || !await users.CheckPasswordAsync(user, req.Password))
                return HttpExtensions.Invalid("password", "Password is incorrect.");

            // Workouts go first: Postgres runs each cascade separately, so custom exercises would otherwise
            // be checked against workout rows that are not deleted yet. Everything else cascades from the user.
            await using var tx = await db.Database.BeginTransactionAsync();
            await db.Workouts.Where(w => w.UserId == user.Id).ExecuteDeleteAsync();
            var result = await users.DeleteAsync(user);
            if (!result.Succeeded) return Results.Problem(statusCode: 500, title: "Could not delete account.");
            await tx.CommitAsync();
            await signIn.SignOutAsync();
            return Results.NoContent();
        }).RequireRateLimiting("auth");
    }
}
