using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FluentValidation;

namespace FitnessTracker.Api.Features;

public sealed record CalorieInput(
    Sex Sex, int Age, decimal HeightCm, decimal WeightKg, decimal? BodyFatPercent,
    ActivityLevel ActivityLevel, GoalMode Mode, decimal WeeklyRateKg, decimal? TargetWeightKg, decimal? ExerciseKcalPerDay = null);

public sealed record Macros(int ProteinG, int FatG, int CarbsG);

public sealed record CalorieResult(
    string Formula, int Bmr, int Tdee, int TargetCalories, int DailyAdjustment,
    decimal WeeklyRateKg, decimal? ProjectedWeeks, DateOnly? ProjectedDate, Macros Macros, IReadOnlyList<string> Warnings,
    string ActivitySource, decimal? ExerciseKcalPerDay); // ActivitySource: ActivityLevel | LoggedWorkouts

public sealed class CalorieInputValidator : AbstractValidator<CalorieInput>
{
    public CalorieInputValidator()
    {
        RuleFor(x => x.Sex).IsInEnum();
        RuleFor(x => x.Age).InclusiveBetween(14, 100);
        RuleFor(x => x.HeightCm).InclusiveBetween(100, 250);
        RuleFor(x => x.WeightKg).InclusiveBetween(20, 400);
        RuleFor(x => x.BodyFatPercent).InclusiveBetween(2, 70);
        RuleFor(x => x.ActivityLevel).IsInEnum();
        RuleFor(x => x.Mode).IsInEnum();
        RuleFor(x => x.WeeklyRateKg).InclusiveBetween(0, 1.5m);
        RuleFor(x => x.TargetWeightKg).InclusiveBetween(20, 400);
        RuleFor(x => x.ExerciseKcalPerDay).InclusiveBetween(0, 3000);
    }
}

/// <summary>Estimates a daily calorie target. It never logs food or drink.</summary>
public static class CalorieCalculator
{
    public const decimal KcalPerKg = 7700m;

    public static decimal ActivityMultiplier(ActivityLevel level) => level switch
    {
        ActivityLevel.Sedentary => 1.2m,
        ActivityLevel.Light => 1.375m,
        ActivityLevel.Moderate => 1.55m,
        ActivityLevel.VeryActive => 1.725m,
        ActivityLevel.ExtraActive => 1.9m,
        _ => throw new ArgumentOutOfRangeException(nameof(level)),
    };

    public static CalorieResult Calculate(CalorieInput i, DateOnly today)
    {
        var warnings = new List<string>();
        var katch = i.BodyFatPercent is not null;
        var bmr = katch
            ? 370m + 21.6m * i.WeightKg * (1 - i.BodyFatPercent!.Value / 100m)                                   // Katch-McArdle
            : 10m * i.WeightKg + 6.25m * i.HeightCm - 5m * i.Age + (i.Sex == Sex.Male ? 5m : -161m);          // Mifflin-St Jeor
        // Measured training replaces the activity multiplier: sedentary base + logged exercise, so nothing is counted twice.
        var tdee = i.ExerciseKcalPerDay is { } exerciseKcal ? bmr * 1.2m + exerciseKcal : bmr * ActivityMultiplier(i.ActivityLevel);

        var sign = i.Mode switch { GoalMode.Lose => -1m, GoalMode.Gain => 1m, _ => 0m };
        var rate = sign == 0 ? 0 : i.WeeklyRateKg;
        var pctPerWeek = rate / i.WeightKg * 100m;
        if (i.Mode == GoalMode.Lose && pctPerWeek > 1m)
            warnings.Add($"Losing more than 1% of body weight per week ({i.WeightKg / 100m:0.0} kg for you) is aggressive and raises the risk of muscle loss.");
        if (i.Mode == GoalMode.Gain && pctPerWeek > 0.5m)
            warnings.Add("Gaining faster than about 0.5% of body weight per week mostly adds fat rather than muscle.");

        var target = tdee + sign * rate * KcalPerKg / 7m;

        // Never recommend below a commonly cited minimum; report the rate that is actually achievable instead.
        var floor = i.Sex == Sex.Male ? 1500m : 1200m;
        if (target < floor)
        {
            warnings.Add($"The requested rate would put you below {floor:0} kcal/day, so the target was raised to that minimum. Very low intakes should be supervised by a healthcare professional.");
            target = floor;
        }
        else if (target < bmr && i.Mode == GoalMode.Lose)
        {
            warnings.Add("This target is below your estimated resting metabolism (BMR). Consider a slower rate.");
        }

        var effectiveRate = Math.Round(Math.Abs(target - tdee) * 7m / KcalPerKg, 2);
        if (i.Age < 18) warnings.Add("Calorie targets for people under 18 should be set with a healthcare professional.");

        decimal? weeks = null;
        if (i.TargetWeightKg is { } goal && sign != 0)
        {
            var remaining = (goal - i.WeightKg) * sign;
            if (remaining <= 0)
                warnings.Add(i.Mode == GoalMode.Lose ? "Your target weight is not below your current weight." : "Your target weight is not above your current weight.");
            else if (effectiveRate > 0)
                weeks = Math.Round(remaining / effectiveRate, 1);
        }

        var roundedTarget = (int)(Math.Round(target / 10m) * 10m);
        return new CalorieResult(
            katch ? "KatchMcArdle" : "MifflinStJeor",
            (int)Math.Round(bmr), (int)Math.Round(tdee), roundedTarget, roundedTarget - (int)Math.Round(tdee),
            effectiveRate, weeks, weeks is null ? null : today.AddDays((int)Math.Ceiling(weeks.Value * 7m)),
            MacrosFor(i, roundedTarget), warnings,
            i.ExerciseKcalPerDay is null ? "ActivityLevel" : "LoggedWorkouts", i.ExerciseKcalPerDay);
    }

    /// <summary>
    /// Protein and fat scale with a reference mass (lean mass, else the loss target, else current weight), so heavy
    /// users are never prescribed more than their calories allow. Carbs take the rest; the kcal always add up to the target.
    /// </summary>
    public static Macros MacrosFor(CalorieInput i, int targetKcal)
    {
        var losing = i.Mode == GoalMode.Lose;
        decimal? lean = i.BodyFatPercent is { } bf ? i.WeightKg * (1 - bf / 100m) : null;
        var reference = lean ?? (losing && i.TargetWeightKg is { } t ? Math.Min(t, i.WeightKg) : i.WeightKg);
        var protein = reference * (lean is not null ? (losing ? 2.2m : 2.0m) : (losing ? 1.8m : 1.6m));
        var fat = Math.Max(targetKcal * 0.25m / 9m, reference * 0.5m);
        var fixedKcal = protein * 4m + fat * 9m;
        if (fixedKcal > targetKcal)
        {
            protein *= targetKcal / fixedKcal;
            fat *= targetKcal / fixedKcal;
        }
        var p = (int)Math.Round(protein);
        var f = (int)Math.Round(fat);
        return new Macros(p, f, (int)Math.Max(0, Math.Round((targetKcal - p * 4m - f * 9m) / 4m)));
    }

    /// <param name="loggedExerciseKcalPerDay">Used only when the user opted into logged activity.</param>
    public static CalorieInput? FromProfile(AppUser u, WeightEntry? latest, DateOnly today, decimal? loggedExerciseKcalPerDay = null) =>
        u is { DateOfBirth: { } dob, Sex: { } sex, HeightCm: { } h } && latest is not null
            ? new CalorieInput(sex, Metrics.Age(dob, today), h, latest.WeightKg, latest.BodyFatPercent,
                u.ActivityLevel, u.GoalMode, u.WeeklyRateKg, u.TargetWeightKg,
                u.UseLoggedActivity ? loggedExerciseKcalPerDay : null)
            : null;

    public static void MapCalculator(this RouteGroupBuilder api) =>
        api.MapPost("/calculator", (CalorieInput input, TimeProvider clock) =>
                TypedResults.Ok(Calculate(input, DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime))))
            .Validate<CalorieInput>()
            .WithTags("Calculator");
}
