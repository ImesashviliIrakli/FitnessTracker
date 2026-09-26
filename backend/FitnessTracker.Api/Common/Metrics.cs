namespace FitnessTracker.Api.Common;

/// <summary>Pure fitness math. Everything metric.</summary>
public static class Metrics
{
    public static decimal? Bmi(decimal weightKg, decimal? heightCm) =>
        heightCm is > 0 ? Math.Round(weightKg / (heightCm.Value / 100m * (heightCm.Value / 100m)), 1) : null;

    public static decimal? LeanMassKg(decimal weightKg, decimal? bodyFatPercent) =>
        bodyFatPercent is null ? null : Math.Round(weightKg * (1 - bodyFatPercent.Value / 100m), 1);

    /// <summary>Epley estimate; only trustworthy for 1–12 reps.</summary>
    public static decimal? Estimated1Rm(decimal? weightKg, int? reps) => (weightKg, reps) switch
    {
        ( > 0, 1) => weightKg,
        ( > 0, >= 2 and <= 12) => Math.Round(weightKg!.Value * (1 + reps!.Value / 30m), 1),
        _ => null,
    };

    /// <summary>Rounds to the nearest loadable increment (e.g. 2.5 kg plates).</summary>
    public static decimal RoundTo(decimal value, decimal step) => Math.Round(value / step, MidpointRounding.AwayFromZero) * step;

    public static decimal SetVolume(decimal? weightKg, int? reps, bool isWarmup) =>
        isWarmup || weightKg is not > 0 || reps is not > 0 ? 0 : weightKg.Value * reps.Value;

    public static decimal? PaceSecPerKm(int? durationSeconds, decimal? distanceM) =>
        durationSeconds is > 0 && distanceM is > 0 ? Math.Round(durationSeconds.Value / (distanceM.Value / 1000m), 0) : null;

    public static decimal MetCalories(decimal met, decimal bodyWeightKg, decimal hours) => met * bodyWeightKg * hours;

    /// <summary>Exponentially smoothed trend (per entry), like the Hacker's Diet trend line.</summary>
    public static decimal[] Trend(IReadOnlyList<decimal> values, decimal alpha = 0.2m)
    {
        var result = new decimal[values.Count];
        for (var i = 0; i < values.Count; i++)
            result[i] = Math.Round(i == 0 ? values[0] : result[i - 1] + alpha * (values[i] - result[i - 1]), 2);
        return result;
    }

    public static DateOnly WeekStart(DateOnly d) => d.AddDays(-(((int)d.DayOfWeek + 6) % 7)); // ISO: Monday

    /// <summary>
    /// Consecutive ISO weeks meeting the target, ending this week. The current week only counts once it is met,
    /// so an in-progress week never breaks a streak.
    /// </summary>
    public static int WeekStreak(IEnumerable<DateOnly> workoutDates, DateOnly today, int weeklyTarget)
    {
        if (weeklyTarget <= 0) return 0;
        var perWeek = workoutDates.GroupBy(WeekStart).ToDictionary(g => g.Key, g => g.Count());
        var week = WeekStart(today);
        var streak = 0;
        if (perWeek.GetValueOrDefault(week) >= weeklyTarget) streak++;
        week = week.AddDays(-7);
        while (perWeek.GetValueOrDefault(week) >= weeklyTarget)
        {
            streak++;
            week = week.AddDays(-7);
        }
        return streak;
    }

    public static int Age(DateOnly dob, DateOnly today) =>
        today.Year - dob.Year - (today < dob.AddYears(today.Year - dob.Year) ? 1 : 0);
}
