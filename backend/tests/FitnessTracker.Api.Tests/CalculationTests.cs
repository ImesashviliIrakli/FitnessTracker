using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FitnessTracker.Api.Features;
using FluentAssertions;

namespace FitnessTracker.Api.Tests;

public class CalorieCalculatorTests
{
    private static readonly DateOnly Today = new(2026, 1, 5);

    private static CalorieInput Input(
        Sex sex = Sex.Male, int age = 30, decimal height = 180, decimal weight = 80, decimal? bf = null,
        ActivityLevel activity = ActivityLevel.Moderate, GoalMode mode = GoalMode.Maintain, decimal rate = 0.5m, decimal? target = null) =>
        new(sex, age, height, weight, bf, activity, mode, rate, target);

    [Fact]
    public void Mifflin_st_jeor_for_male_matches_reference_values()
    {
        // 10*80 + 6.25*180 - 5*30 + 5 = 1780; TDEE = 1780 * 1.55 = 2759
        var r = CalorieCalculator.Calculate(Input(), Today);

        r.Formula.Should().Be("MifflinStJeor");
        r.Bmr.Should().Be(1780);
        r.Tdee.Should().Be(2759);
        r.TargetCalories.Should().Be(2760);
        r.Warnings.Should().BeEmpty();
    }

    [Fact]
    public void Mifflin_st_jeor_for_female_uses_minus_161()
    {
        // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
        CalorieCalculator.Calculate(Input(sex: Sex.Female, height: 165, weight: 60), Today).Bmr.Should().Be(1320);
    }

    [Fact]
    public void Katch_mcardle_is_used_when_body_fat_is_known()
    {
        // LBM = 80 * 0.8 = 64; 370 + 21.6*64 = 1752.4
        var r = CalorieCalculator.Calculate(Input(bf: 20), Today);

        r.Formula.Should().Be("KatchMcArdle");
        r.Bmr.Should().Be(1752);
    }

    [Fact]
    public void Losing_half_a_kilo_per_week_is_a_550_kcal_deficit_and_projects_a_goal_date()
    {
        var r = CalorieCalculator.Calculate(Input(mode: GoalMode.Lose, rate: 0.5m, target: 75), Today);

        r.DailyAdjustment.Should().BeCloseTo(-550, 10);
        r.WeeklyRateKg.Should().BeApproximately(0.5m, 0.01m);
        r.ProjectedWeeks.Should().BeApproximately(10m, 0.2m);
        r.ProjectedDate.Should().BeOnOrAfter(Today.AddDays(69)).And.BeOnOrBefore(Today.AddDays(71));
        r.Warnings.Should().BeEmpty();
    }

    [Fact]
    public void Aggressive_loss_warns_and_clamps_to_the_calorie_floor()
    {
        var r = CalorieCalculator.Calculate(
            Input(sex: Sex.Female, age: 40, height: 160, weight: 60, activity: ActivityLevel.Sedentary, mode: GoalMode.Lose, rate: 1.5m, target: 50), Today);

        r.TargetCalories.Should().Be(1200);
        r.WeeklyRateKg.Should().BeLessThan(1.5m, "the projection must reflect the clamped target");
        r.Warnings.Should().Contain(w => w.Contains("1% of body weight")).And.Contain(w => w.Contains("1200 kcal"));
    }

    [Fact]
    public void Fast_gain_and_wrong_direction_targets_warn()
    {
        var r = CalorieCalculator.Calculate(Input(mode: GoalMode.Gain, rate: 1m, target: 70), Today);

        r.Warnings.Should().Contain(w => w.Contains("0.5%")).And.Contain(w => w.Contains("not above"));
        r.ProjectedDate.Should().BeNull();
    }

    [Fact]
    public void Macros_add_up_to_roughly_the_target()
    {
        var r = CalorieCalculator.Calculate(Input(mode: GoalMode.Lose, target: 75), Today);

        r.Macros.ProteinG.Should().Be(135); // 1.8 g/kg of the 75 kg target while losing
        Kcal(r.Macros).Should().BeCloseTo(r.TargetCalories, 10);
    }

    private static int Kcal(Macros m) => m.ProteinG * 4 + m.FatG * 9 + m.CarbsG * 4;

    [Fact]
    public void Heavy_user_on_the_calorie_floor_still_gets_carbs()
    {
        // 120 kg, aggressive loss clamps to 1500 kcal. The old 2 g/kg of total weight gave 240 g protein and 0 carbs.
        var r = CalorieCalculator.Calculate(
            Input(age: 40, height: 175, weight: 120, activity: ActivityLevel.Sedentary, mode: GoalMode.Lose, rate: 1.5m), Today);

        r.TargetCalories.Should().Be(1500);
        r.Macros.ProteinG.Should().Be(216); // 1.8 g/kg of 120 kg
        r.Macros.FatG.Should().Be(60);      // 0.5 g/kg beats 25% of kcal
        r.Macros.CarbsG.Should().Be(24);
        Kcal(r.Macros).Should().BeCloseTo(1500, 10);
    }

    [Fact]
    public void Lean_mass_drives_protein_when_body_fat_is_known()
    {
        // Lean mass 80 * 0.8 = 64 kg -> 2.2 g/kg while losing, 2.0 otherwise.
        CalorieCalculator.Calculate(Input(bf: 20, mode: GoalMode.Lose, target: 75), Today).Macros.ProteinG.Should().Be(141);
        CalorieCalculator.Calculate(Input(bf: 20, mode: GoalMode.Gain), Today).Macros.ProteinG.Should().Be(128);
    }

    [Theory]
    [InlineData(GoalMode.Lose, 80, null, 75)]
    [InlineData(GoalMode.Maintain, 80, null, null)]
    [InlineData(GoalMode.Gain, 60, 15, null)]
    [InlineData(GoalMode.Lose, 250, null, null)] // protein + fat alone exceed the target -> scaled down
    [InlineData(GoalMode.Lose, 160, 45, 100)]
    public void Macro_kcal_match_the_target_in_every_mode(GoalMode mode, int weight, int? bf, int? target)
    {
        var r = CalorieCalculator.Calculate(Input(sex: Sex.Female, weight: (decimal)weight, bf: (decimal?)bf, mode: mode, rate: 1m,
            target: (decimal?)target, activity: ActivityLevel.Sedentary), Today);

        Kcal(r.Macros).Should().BeCloseTo(r.TargetCalories, 10);
        r.Macros.CarbsG.Should().BeGreaterThanOrEqualTo(0);
    }
}

public class MetricsTests
{
    [Theory]
    [InlineData(100, 1, 100)]
    [InlineData(100, 5, 116.7)]
    [InlineData(100, 10, 133.3)]
    public void Epley_estimated_1rm(double weight, int reps, double expected) =>
        Metrics.Estimated1Rm((decimal)weight, reps).Should().Be((decimal)expected);

    [Theory]
    [InlineData(100, 0)]
    [InlineData(100, 13)]
    [InlineData(0, 5)]
    public void Estimated_1rm_is_null_outside_its_valid_range(double weight, int reps) =>
        Metrics.Estimated1Rm((decimal)weight, reps).Should().BeNull();

    [Fact]
    public void Warmups_do_not_count_toward_volume()
    {
        Metrics.SetVolume(100, 5, isWarmup: false).Should().Be(500);
        Metrics.SetVolume(100, 5, isWarmup: true).Should().Be(0);
        Metrics.SetVolume(null, 5, isWarmup: false).Should().Be(0);
    }

    [Fact]
    public void Bmi_and_lean_mass()
    {
        Metrics.Bmi(80, 180).Should().Be(24.7m);
        Metrics.Bmi(80, null).Should().BeNull();
        Metrics.LeanMassKg(80, 20).Should().Be(64m);
    }

    [Fact]
    public void Pace_is_seconds_per_km() => Metrics.PaceSecPerKm(1500, 5000).Should().Be(300);

    [Fact]
    public void Age_accounts_for_birthday_not_yet_reached()
    {
        Metrics.Age(new DateOnly(1990, 6, 15), new DateOnly(2026, 6, 14)).Should().Be(35);
        Metrics.Age(new DateOnly(1990, 6, 15), new DateOnly(2026, 6, 15)).Should().Be(36);
    }

    [Fact]
    public void Week_start_is_monday() => Metrics.WeekStart(new DateOnly(2026, 1, 11)).Should().Be(new DateOnly(2026, 1, 5));

    [Fact]
    public void Streak_counts_consecutive_weeks_and_ignores_an_unfinished_current_week()
    {
        var today = new DateOnly(2026, 1, 14); // Wednesday
        var dates = new[]
        {
            new DateOnly(2026, 1, 12),                            // current week: 1 (target 2 not met yet)
            new DateOnly(2026, 1, 6), new DateOnly(2026, 1, 8),   // last week: 2
            new DateOnly(2025, 12, 30), new DateOnly(2026, 1, 2), // week before: 2
            new DateOnly(2025, 12, 23),                           // only 1 -> streak ends
        };

        Metrics.WeekStreak(dates, today, 2).Should().Be(2);
        Metrics.WeekStreak(dates.Append(new DateOnly(2026, 1, 13)), today, 2).Should().Be(3);
        Metrics.WeekStreak(dates, today, 0).Should().Be(0);
    }

    [Fact]
    public void Trend_smooths_toward_new_values()
    {
        var t = Metrics.Trend([80m, 80m, 85m]);
        t[0].Should().Be(80m);
        t[2].Should().Be(81m);
    }

    [Fact]
    public void Csv_fields_are_quoted_and_formula_injection_is_defused()
    {
        BodyEndpoints.Csv("=SUM(A1)").Should().Be("\"'=SUM(A1)\"");
        BodyEndpoints.Csv("say \"hi\"").Should().Be("\"say \"\"hi\"\"\"");
        BodyEndpoints.Csv(null).Should().BeEmpty();
    }
}
