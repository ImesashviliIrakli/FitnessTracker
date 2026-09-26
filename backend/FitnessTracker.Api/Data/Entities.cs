using Microsoft.AspNetCore.Identity;

namespace FitnessTracker.Api.Data;

public enum Sex { Male, Female }
public enum ActivityLevel { Sedentary, Light, Moderate, VeryActive, ExtraActive }
public enum UnitSystem { Metric, Imperial }
public enum GoalMode { Lose, Maintain, Gain }
public enum ExerciseCategory { Strength, Cardio, Mobility, Sport }
public enum WorkoutType { Strength, Cardio, Mobility, Other }
public enum TemplateKind { Workout, RestDay }
public enum GroupType { Superset, Circuit }
public enum PlanStatus { Planned, Completed, Skipped }

// All stored values are metric (kg, cm, m, s). Dates are DateOnly in the user's timezone; timestamps UTC.
public sealed class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = "";
    public DateOnly? DateOfBirth { get; set; }
    public Sex? Sex { get; set; }
    public decimal? HeightCm { get; set; }
    public ActivityLevel ActivityLevel { get; set; } = ActivityLevel.Moderate;
    public UnitSystem UnitSystem { get; set; } = UnitSystem.Metric;
    public string TimeZone { get; set; } = "UTC";
    public DateTime CreatedAt { get; set; }

    // Goal (one active goal per user).
    public GoalMode GoalMode { get; set; } = GoalMode.Maintain;
    public decimal? TargetWeightKg { get; set; }
    public DateOnly? TargetDate { get; set; }
    public decimal WeeklyRateKg { get; set; } = 0.5m;
    public int WeeklyWorkoutTarget { get; set; } = 3;
    public decimal? GoalStartWeightKg { get; set; }

    /// <summary>Use measured workout calories instead of the activity multiplier for TDEE.</summary>
    public bool UseLoggedActivity { get; set; }

    public bool ProfileComplete => DateOfBirth is not null && Sex is not null && HeightCm is not null;
}

public sealed class WeightEntry
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public DateOnly Date { get; set; }
    public decimal WeightKg { get; set; }
    public decimal? BodyFatPercent { get; set; }
    public string? Note { get; set; }
}

public sealed class MeasurementEntry
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public DateOnly Date { get; set; }
    public decimal? WaistCm { get; set; }
    public decimal? ChestCm { get; set; }
    public decimal? HipsCm { get; set; }
    public decimal? ArmCm { get; set; }
    public decimal? ThighCm { get; set; }
    public decimal? NeckCm { get; set; }
    public decimal? ShouldersCm { get; set; }
    public string? Note { get; set; }
}

public sealed class DailyLog
{
    public Guid UserId { get; set; }
    public DateOnly Date { get; set; }
    public int? Steps { get; set; }
    public decimal? SleepHours { get; set; }
    public int? RestingHeartRate { get; set; }
    public int? Energy { get; set; }
    public int? Soreness { get; set; }
    public int? Mood { get; set; }
    public string? Note { get; set; }
}

public sealed class Exercise
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid? UserId { get; set; } // null = built-in library
    public string Name { get; set; } = "";
    public ExerciseCategory Category { get; set; }
    public string? PrimaryMuscle { get; set; }
    public decimal? Met { get; set; }
}

public sealed class Workout
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public DateOnly Date { get; set; }
    public string Name { get; set; } = "";
    public int? DurationMinutes { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public TimeOnly? StartTime { get; set; } // local time
    public WorkoutType Type { get; set; }
    public Guid? TemplateId { get; set; }
    public Guid? PlanEntryId { get; set; } // informational; PlanEntry.WorkoutId is the enforced link
    public List<WorkoutExercise> Exercises { get; set; } = [];
}

public sealed class WorkoutExercise
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid WorkoutId { get; set; }
    public int Position { get; set; }
    public Guid ExerciseId { get; set; }
    public Exercise Exercise { get; set; } = null!;
    public int? SupersetGroup { get; set; }
    public string? Notes { get; set; }
    public List<WorkoutSet> Sets { get; set; } = [];
}

public sealed class WorkoutSet
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid WorkoutExerciseId { get; set; }
    public int Position { get; set; }
    public int? Reps { get; set; }
    public decimal? WeightKg { get; set; }
    public decimal? Rpe { get; set; }
    public int? Rir { get; set; }
    public int? RestSeconds { get; set; }
    public string? Tempo { get; set; }
    public int? DurationSeconds { get; set; }
    public decimal? DistanceM { get; set; }
    public int? AvgHeartRate { get; set; }
    public bool IsWarmup { get; set; }
}

public sealed class WorkoutTemplate
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; } // column "Notes" (pre-v2 name)
    public TemplateKind Kind { get; set; }
    public List<TemplateItem> Exercises { get; set; } = []; // stored as jsonb
}

public sealed class TemplateItem
{
    public Guid ExerciseId { get; set; }
    public int Sets { get; set; }
    public int? Reps { get; set; }
    public decimal? WeightKg { get; set; } // API: targetWeightKg (JSON key kept so existing rows read)
    public decimal? TargetPercent1Rm { get; set; }
    public int? RestSeconds { get; set; }
    public string? Tempo { get; set; }
    public decimal? Rpe { get; set; }
    public int? Rir { get; set; }
    public string? Notes { get; set; }
    public int? Group { get; set; }
    public GroupType? GroupType { get; set; }
}

public sealed class PlanEntry
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public DateOnly Date { get; set; }
    public Guid? TemplateId { get; set; }
    public WorkoutTemplate? Template { get; set; }
    public PlanStatus Status { get; set; }
    public Guid? WorkoutId { get; set; }
    public Guid? SeriesId { get; set; }
    public string? Note { get; set; }
}

/// <summary>The one in-progress workout of a user; exercises and sets live in a jsonb document.</summary>
public sealed class WorkoutSession
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public DateTime StartedAt { get; set; }
    public Guid? TemplateId { get; set; }
    public Guid? PlanEntryId { get; set; }
    public string? Notes { get; set; }
    public string ExercisesJson { get; set; } = "[]";
    public DateTime UpdatedAt { get; set; }
}
