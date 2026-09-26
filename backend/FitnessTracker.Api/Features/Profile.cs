using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FluentValidation;

namespace FitnessTracker.Api.Features;

public sealed record ProfileDto(
    string DisplayName, string Email, DateOnly? DateOfBirth, int? Age, Sex? Sex, decimal? HeightCm,
    ActivityLevel ActivityLevel, UnitSystem UnitSystem, string TimeZone, bool UseLoggedActivity);

public sealed record UpdateProfile(
    string DisplayName, DateOnly? DateOfBirth, Sex? Sex, decimal? HeightCm,
    ActivityLevel ActivityLevel, UnitSystem UnitSystem, string TimeZone, bool UseLoggedActivity = false);

public sealed record GoalDto(GoalMode Mode, decimal? TargetWeightKg, DateOnly? TargetDate, decimal WeeklyRateKg, int WeeklyWorkoutTarget);

public sealed class UpdateProfileValidator : AbstractValidator<UpdateProfile>
{
    public UpdateProfileValidator(TimeProvider clock)
    {
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(60);
        RuleFor(x => x.DateOfBirth)
            .Must(d => d is null || Metrics.Age(d.Value, DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime)) is >= 14 and <= 100)
            .WithMessage("Age must be between 14 and 100.");
        RuleFor(x => x.Sex).IsInEnum();
        RuleFor(x => x.HeightCm).InclusiveBetween(100, 250);
        RuleFor(x => x.ActivityLevel).IsInEnum();
        RuleFor(x => x.UnitSystem).IsInEnum();
        RuleFor(x => x.TimeZone).NotEmpty().MaximumLength(64)
            .Must(tz => TimeZoneInfo.TryFindSystemTimeZoneById(tz, out _)).WithMessage("Unknown time zone.");
    }
}

public sealed class GoalValidator : AbstractValidator<GoalDto>
{
    public GoalValidator()
    {
        RuleFor(x => x.Mode).IsInEnum();
        RuleFor(x => x.TargetWeightKg).InclusiveBetween(20, 400);
        RuleFor(x => x.WeeklyRateKg).InclusiveBetween(0, 1.5m);
        RuleFor(x => x.WeeklyWorkoutTarget).InclusiveBetween(0, 7);
    }
}

public static class ProfileEndpoints
{
    public static ProfileDto ToDto(this AppUser u, DateOnly today) => new(
        u.DisplayName, u.Email!, u.DateOfBirth, u.DateOfBirth is { } d ? Metrics.Age(d, today) : null,
        u.Sex, u.HeightCm, u.ActivityLevel, u.UnitSystem, u.TimeZone, u.UseLoggedActivity);

    public static GoalDto ToGoal(this AppUser u) =>
        new(u.GoalMode, u.TargetWeightKg, u.TargetDate, u.WeeklyRateKg, u.WeeklyWorkoutTarget);

    public static void MapProfile(this RouteGroupBuilder api)
    {
        var profile = api.MapGroup("/profile").WithTags("Profile");

        profile.MapGet("/", async (AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            return TypedResults.Ok(u.ToDto(clock.Today(u.TimeZone)));
        });

        profile.MapPut("/", async (UpdateProfile req, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            u.DisplayName = req.DisplayName.Trim();
            u.DateOfBirth = req.DateOfBirth;
            u.Sex = req.Sex;
            u.HeightCm = req.HeightCm;
            u.ActivityLevel = req.ActivityLevel;
            u.UnitSystem = req.UnitSystem;
            u.TimeZone = req.TimeZone;
            u.UseLoggedActivity = req.UseLoggedActivity;
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(u.ToDto(clock.Today(u.TimeZone)));
        }).Validate<UpdateProfile>();

        var goals = api.MapGroup("/goals").WithTags("Goals");

        goals.MapGet("/", async (AppDbContext db, HttpContext ctx, CancellationToken ct) =>
            TypedResults.Ok((await db.CurrentUserAsync(ctx.User, ct)).ToGoal()));

        goals.MapPut("/", async Task<IResult> (GoalDto req, AppDbContext db, HttpContext ctx, TimeProvider clock, CancellationToken ct) =>
        {
            var u = await db.CurrentUserAsync(ctx.User, ct);
            var current = (await db.LatestWeightAsync(u.Id, ct))?.WeightKg;

            // Rules that need the user's weight and time zone, so they live here rather than in GoalValidator.
            var errors = new Dictionary<string, string[]>();
            if (req.TargetWeightKg is { } target && current is { } now)
            {
                if (req.Mode == GoalMode.Lose && target >= now)
                    errors["targetWeightKg"] = [$"For a loss goal, the target must be below your current weight ({now:0.#} kg)."];
                else if (req.Mode == GoalMode.Gain && target <= now)
                    errors["targetWeightKg"] = [$"For a gain goal, the target must be above your current weight ({now:0.#} kg)."];
            }
            if (req.TargetDate is { } date && date <= clock.Today(u.TimeZone))
                errors["targetDate"] = ["Target date must be in the future."];
            if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

            // A new target or mode restarts progress tracking from the latest weight.
            if (u.GoalMode != req.Mode || u.TargetWeightKg != req.TargetWeightKg || u.GoalStartWeightKg is null)
                u.GoalStartWeightKg = current;
            u.GoalMode = req.Mode;
            u.TargetWeightKg = req.TargetWeightKg;
            u.TargetDate = req.TargetDate;
            u.WeeklyRateKg = req.WeeklyRateKg;
            u.WeeklyWorkoutTarget = req.WeeklyWorkoutTarget;
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(u.ToGoal());
        }).Validate<GoalDto>();
    }
}
