using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options), IDataProtectionKeyContext
{
    public DbSet<WeightEntry> Weights => Set<WeightEntry>();
    public DbSet<MeasurementEntry> Measurements => Set<MeasurementEntry>();
    public DbSet<DailyLog> DailyLogs => Set<DailyLog>();
    public DbSet<Exercise> Exercises => Set<Exercise>();
    public DbSet<Workout> Workouts => Set<Workout>();
    public DbSet<WorkoutTemplate> Templates => Set<WorkoutTemplate>();
    public DbSet<PlanEntry> PlanEntries => Set<PlanEntry>();
    public DbSet<WorkoutSession> Sessions => Set<WorkoutSession>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void ConfigureConventions(ModelConfigurationBuilder b)
    {
        b.Properties<decimal>().HavePrecision(9, 2);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<AppUser>(e =>
        {
            e.Property(u => u.DisplayName).HasMaxLength(60);
            e.Property(u => u.TimeZone).HasMaxLength(64);
            e.Property(u => u.Sex).HasConversion<string>().HasMaxLength(16);
            e.Property(u => u.ActivityLevel).HasConversion<string>().HasMaxLength(16);
            e.Property(u => u.UnitSystem).HasConversion<string>().HasMaxLength(16);
            e.Property(u => u.GoalMode).HasConversion<string>().HasMaxLength(16);
        });

        // Every user-owned row cascades on account deletion.
        b.Entity<WeightEntry>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.Date }).IsUnique();
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<MeasurementEntry>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.Date }).IsUnique();
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<DailyLog>(e =>
        {
            e.HasKey(x => new { x.UserId, x.Date });
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<Exercise>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.PrimaryMuscle).HasMaxLength(50);
            e.Property(x => x.Category).HasConversion<string>().HasMaxLength(16);
            e.HasIndex(x => new { x.UserId, x.Name });
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasData(ExerciseSeed.All);
        });
        b.Entity<Workout>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(16);
            e.HasIndex(x => new { x.UserId, x.Date });
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            // Deleting a template never deletes history.
            e.HasOne<WorkoutTemplate>().WithMany().HasForeignKey(x => x.TemplateId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(x => x.Exercises).WithOne().HasForeignKey(x => x.WorkoutId).OnDelete(DeleteBehavior.Cascade);
        });
        // Children get client-side v7 ids and are reached via navigation on update; ValueGeneratedNever
        // makes EF insert them instead of assuming a set key means an existing row.
        b.Entity<WorkoutSet>().Property(x => x.Id).ValueGeneratedNever();
        b.Entity<WorkoutExercise>(e =>
        {
            e.Property(x => x.Id).ValueGeneratedNever();
            // NoAction (checked at statement end) so a user delete can cascade both workouts and custom exercises.
            e.HasOne(x => x.Exercise).WithMany().HasForeignKey(x => x.ExerciseId).OnDelete(DeleteBehavior.NoAction);
            e.HasMany(x => x.Sets).WithOne().HasForeignKey(x => x.WorkoutExerciseId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<WorkoutSet>(e => e.Property(x => x.Tempo).HasMaxLength(16));
        b.Entity<WorkoutTemplate>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Description).HasColumnName("Notes");
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.OwnsMany(x => x.Exercises, o =>
            {
                o.ToJson();
                o.Property(i => i.GroupType).HasConversion<string>();
            });
        });
        b.Entity<PlanEntry>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasIndex(x => new { x.UserId, x.Date });
            e.HasIndex(x => x.SeriesId);
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Template).WithMany().HasForeignKey(x => x.TemplateId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne<Workout>().WithMany().HasForeignKey(x => x.WorkoutId).OnDelete(DeleteBehavior.SetNull);
        });
        b.Entity<WorkoutSession>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.ExercisesJson).HasColumnType("jsonb");
            e.HasIndex(x => x.UserId).IsUnique(); // one active session per user
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<WorkoutTemplate>().WithMany().HasForeignKey(x => x.TemplateId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne<PlanEntry>().WithMany().HasForeignKey(x => x.PlanEntryId).OnDelete(DeleteBehavior.SetNull);
        });
    }
}

public static class ExerciseSeed
{
    // Stable ids derived from the name so HasData stays deterministic across migrations.
    public static Guid IdFor(string name) => new(MD5.HashData(Encoding.UTF8.GetBytes("builtin:" + name)));

    private static Exercise E(string name, ExerciseCategory c, string? muscle, decimal met) =>
        new() { Id = IdFor(name), Name = name, Category = c, PrimaryMuscle = muscle, Met = met };

    // MET values from the Compendium of Physical Activities (approximate, moderate effort).
    public static readonly Exercise[] All =
    [
        E("Back Squat", ExerciseCategory.Strength, "Quads", 5.0m),
        E("Front Squat", ExerciseCategory.Strength, "Quads", 5.0m),
        E("Deadlift", ExerciseCategory.Strength, "Posterior chain", 6.0m),
        E("Romanian Deadlift", ExerciseCategory.Strength, "Hamstrings", 5.0m),
        E("Bench Press", ExerciseCategory.Strength, "Chest", 5.0m),
        E("Incline Dumbbell Press", ExerciseCategory.Strength, "Chest", 5.0m),
        E("Overhead Press", ExerciseCategory.Strength, "Shoulders", 5.0m),
        E("Barbell Row", ExerciseCategory.Strength, "Back", 5.0m),
        E("Pull-up", ExerciseCategory.Strength, "Back", 5.0m),
        E("Chin-up", ExerciseCategory.Strength, "Back", 5.0m),
        E("Lat Pulldown", ExerciseCategory.Strength, "Back", 3.5m),
        E("Seated Cable Row", ExerciseCategory.Strength, "Back", 3.5m),
        E("Dip", ExerciseCategory.Strength, "Triceps", 5.0m),
        E("Hip Thrust", ExerciseCategory.Strength, "Glutes", 5.0m),
        E("Leg Press", ExerciseCategory.Strength, "Quads", 5.0m),
        E("Walking Lunge", ExerciseCategory.Strength, "Quads", 5.0m),
        E("Leg Curl", ExerciseCategory.Strength, "Hamstrings", 3.5m),
        E("Leg Extension", ExerciseCategory.Strength, "Quads", 3.5m),
        E("Calf Raise", ExerciseCategory.Strength, "Calves", 3.5m),
        E("Dumbbell Curl", ExerciseCategory.Strength, "Biceps", 3.5m),
        E("Triceps Pushdown", ExerciseCategory.Strength, "Triceps", 3.5m),
        E("Lateral Raise", ExerciseCategory.Strength, "Shoulders", 3.5m),
        E("Face Pull", ExerciseCategory.Strength, "Rear delts", 3.5m),
        E("Plank", ExerciseCategory.Strength, "Core", 3.8m),
        E("Running", ExerciseCategory.Cardio, null, 9.8m),
        E("Walking", ExerciseCategory.Cardio, null, 3.5m),
        E("Hiking", ExerciseCategory.Cardio, null, 6.0m),
        E("Cycling", ExerciseCategory.Cardio, null, 7.5m),
        E("Indoor Cycling", ExerciseCategory.Cardio, null, 8.5m),
        E("Rowing Machine", ExerciseCategory.Cardio, null, 7.0m),
        E("Elliptical", ExerciseCategory.Cardio, null, 5.0m),
        E("Swimming", ExerciseCategory.Cardio, null, 5.8m),
        E("Stair Climber", ExerciseCategory.Cardio, null, 9.0m),
        E("Jump Rope", ExerciseCategory.Cardio, null, 11.8m),
        E("Yoga", ExerciseCategory.Mobility, null, 2.5m),
        E("Stretching", ExerciseCategory.Mobility, null, 2.3m),
        E("Foam Rolling", ExerciseCategory.Mobility, null, 2.0m),
        E("Pilates", ExerciseCategory.Mobility, null, 3.0m),
        E("Soccer", ExerciseCategory.Sport, null, 7.0m),
        E("Basketball", ExerciseCategory.Sport, null, 6.5m),
        E("Tennis", ExerciseCategory.Sport, null, 7.3m),
        E("Climbing", ExerciseCategory.Sport, null, 8.0m),
        E("Martial Arts", ExerciseCategory.Sport, null, 10.3m),
    ];
}
