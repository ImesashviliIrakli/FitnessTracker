using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FitnessTracker.Api.Data;
using FitnessTracker.Api.Features;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace FitnessTracker.Api.Tests;

/// <summary>
/// Runs the API against a throwaway database on the local dev Postgres server (the one in
/// appsettings.Development[.local].json, or FITTRACK_TEST_DB). Migrations create it; it is dropped afterwards.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly string _connectionString = TestConnectionString();

    private static string TestConnectionString()
    {
        var devConfig = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddJsonFile("appsettings.Development.local.json", optional: true)
            .Build();
        var server = Environment.GetEnvironmentVariable("FITTRACK_TEST_DB") ?? devConfig.GetConnectionString("Default")
            ?? throw new InvalidOperationException("No Postgres configured: set FITTRACK_TEST_DB or ConnectionStrings:Default in appsettings.Development.json.");
        return new NpgsqlConnectionStringBuilder(server) { Database = $"FitnessTracker_Tests_{Guid.NewGuid():N}" }.ConnectionString;
    }

    public ValueTask InitializeAsync()
    {
        // Program reads these before Build(), so pass them as environment-level settings.
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", _connectionString);
        Environment.SetEnvironmentVariable("RateLimiting__AuthPerMinute", "100000");
        Environment.SetEnvironmentVariable("RateLimiting__PerUserPerMinute", "100000");
        Environment.SetEnvironmentVariable("Cors__AllowedOrigins", "https://app.example.test");
        Environment.SetEnvironmentVariable("Serilog__MinimumLevel__Default", "Warning");
        Environment.SetEnvironmentVariable("Serilog__MinimumLevel__Override__Microsoft.AspNetCore", "Error");
        return ValueTask.CompletedTask;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseEnvironment("Testing");

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        var csb = new NpgsqlConnectionStringBuilder(_connectionString);
        var database = csb.Database;
        csb.Database = "postgres";
        NpgsqlConnection.ClearAllPools();
        await using var conn = new NpgsqlConnection(csb.ConnectionString);
        await conn.OpenAsync();
        await using var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{database}\" WITH (FORCE)", conn);
        await drop.ExecuteNonQueryAsync();
    }

    public HttpClient Client(bool csrf = true)
    {
        // https base so the Secure auth cookie round-trips.
        var client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = true });
        if (csrf) client.DefaultRequestHeaders.Add("X-CSRF", "1");
        return client;
    }

    public async Task<HttpClient> SignedInClient(string password = "Sup3rSecret!")
    {
        var client = Client();
        var res = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"u{Guid.NewGuid():N}@test.dev", password, "Tester"));
        res.EnsureSuccessStatusCode();
        return client;
    }
}

[CollectionDefinition(nameof(ApiCollection))]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>;

[Collection(nameof(ApiCollection))]
public class ApiTests(ApiFactory api)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static readonly Guid BenchPress = ExerciseSeed.IdFor("Bench Press");
    private static readonly Guid Running = ExerciseSeed.IdFor("Running");
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<T> Read<T>(HttpResponseMessage res) => (await res.Content.ReadFromJsonAsync<T>(Json, Ct))!;

    private static WorkoutInput BenchWorkout(DateOnly date, decimal weight = 100, int reps = 5) => new(
        date, "Push day", 60, null,
        [
            new WorkoutExerciseInput(BenchPress, null, null,
            [
                new SetInput(10, 40, null, null, 90, null, null, null, null, IsWarmup: true),
                new SetInput(reps, weight, 8, 2, 180, "3-1-1-0", null, null, null, IsWarmup: false),
                new SetInput(reps, weight, 9, 1, 180, null, null, null, null, IsWarmup: false),
            ]),
        ]);

    [Fact]
    public async Task Health_endpoint_reports_healthy_database()
    {
        var res = await api.Client().GetAsync("/health", Ct);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Register_signs_in_and_logout_signs_out()
    {
        var client = await api.SignedInClient();

        var me = await Read<Me>(await client.GetAsync("/api/auth/me", Ct));
        me.DisplayName.Should().Be("Tester");
        me.ProfileComplete.Should().BeFalse();

        (await client.PostAsync("/api/auth/logout", null, Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await client.GetAsync("/api/auth/me", Ct)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_rejects_wrong_password_and_accepts_right_one()
    {
        var email = $"u{Guid.NewGuid():N}@test.dev";
        await api.Client().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Sup3rSecret!", "A"), Ct);

        var client = api.Client();
        (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "WrongPass123", false), Ct))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "Sup3rSecret!", false), Ct))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Weak_password_returns_validation_problem()
    {
        var res = await api.Client().PostAsJsonAsync("/api/auth/register", new RegisterRequest($"u{Guid.NewGuid():N}@test.dev", "short", "A"), Ct);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await Read<ValidationProblemDetails>(res)).Errors.Should().ContainKey("password");
    }

    [Fact]
    public async Task Api_requires_authentication() =>
        (await api.Client().GetAsync("/api/weights", Ct)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

    [Fact]
    public async Task Unsafe_requests_without_csrf_header_are_rejected()
    {
        var res = await api.Client(csrf: false).PostAsJsonAsync("/api/auth/login", new LoginRequest("a@b.c", "x", false), Ct);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Cors_allows_only_the_configured_origin()
    {
        var client = api.Client();
        HttpRequestMessage Preflight(string origin)
        {
            var req = new HttpRequestMessage(HttpMethod.Options, "/api/weights");
            req.Headers.Add("Origin", origin);
            req.Headers.Add("Access-Control-Request-Method", "POST");
            req.Headers.Add("Access-Control-Request-Headers", "content-type,x-csrf");
            return req;
        }

        var ok = await client.SendAsync(Preflight("https://app.example.test"), Ct);
        ok.Headers.GetValues("Access-Control-Allow-Origin").Should().ContainSingle("https://app.example.test");
        ok.Headers.GetValues("Access-Control-Allow-Credentials").Should().ContainSingle("true");

        var evil = await client.SendAsync(Preflight("https://evil.example"), Ct);
        evil.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse();
    }

    [Fact]
    public async Task Weight_crud_computes_bmi_and_rejects_duplicate_dates()
    {
        var client = await api.SignedInClient();
        await client.PutAsJsonAsync("/api/profile", new UpdateProfile("T", new DateOnly(1990, 1, 1), Sex.Male, 180, ActivityLevel.Moderate, UnitSystem.Metric, "Europe/Berlin"), Json, Ct);

        var created = await client.PostAsJsonAsync("/api/weights", new WeightInput(new DateOnly(2026, 1, 1), 80, 20, "fasted"), Json, Ct);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var entry = await Read<WeightEntryDto>(created);
        entry.Bmi.Should().Be(24.7m);
        entry.LeanMassKg.Should().Be(64m);

        (await client.PostAsJsonAsync("/api/weights", new WeightInput(new DateOnly(2026, 1, 1), 81, null, null), Json, Ct))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);

        var updated = await Read<WeightEntryDto>(await client.PutAsJsonAsync($"/api/weights/{entry.Id}", new WeightInput(new DateOnly(2026, 1, 1), 79.5m, null, null), Json, Ct));
        updated.WeightKg.Should().Be(79.5m);

        var list = await Read<List<WeightEntryDto>>(await client.GetAsync("/api/weights?from=2025-12-01&to=2026-02-01", Ct));
        list.Should().ContainSingle();

        (await client.DeleteAsync($"/api/weights/{entry.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Invalid_input_reports_camel_case_field_errors()
    {
        var client = await api.SignedInClient();
        var res = await client.PostAsJsonAsync("/api/weights", new WeightInput(new DateOnly(2026, 1, 1), 5, 90, null), Json, Ct);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await Read<ValidationProblemDetails>(res)).Errors.Keys.Should().Contain(["weightKg", "bodyFatPercent"]);
    }

    [Fact]
    public async Task Workout_round_trip_computes_volume_e1rm_records_and_replaces_sets_on_update()
    {
        var client = await api.SignedInClient();
        await client.PostAsJsonAsync("/api/weights", new WeightInput(new DateOnly(2026, 1, 1), 80, null, null), Json, Ct);

        var created = await client.PostAsJsonAsync("/api/workouts", BenchWorkout(new DateOnly(2026, 1, 2)), Json, Ct);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var workout = await Read<WorkoutDto>(created);
        workout.TotalVolumeKg.Should().Be(1000); // warmup excluded
        workout.Exercises[0].Sets.Should().HaveCount(3);
        workout.Exercises[0].Sets[0].Estimated1Rm.Should().BeNull("warmups never produce records");
        workout.Exercises[0].Sets[1].Estimated1Rm.Should().Be(116.7m);
        workout.EstimatedCalories.Should().Be(400); // MET 5 * 80 kg * 1 h

        var updated = await Read<WorkoutDto>(await client.PutAsJsonAsync($"/api/workouts/{workout.Id}", BenchWorkout(new DateOnly(2026, 1, 2), weight: 110, reps: 3), Json, Ct));
        updated.TotalVolumeKg.Should().Be(660);
        updated.Exercises.Single().Sets.Should().HaveCount(3);

        var records = await Read<List<PersonalRecordDto>>(await client.GetAsync("/api/records", Ct));
        records.Should().ContainSingle(r => r.ExerciseId == BenchPress).Which.BestWeightKg.Should().Be(110);
    }

    [Fact]
    public async Task Cardio_sets_use_their_duration_for_calories_and_report_pace()
    {
        var client = await api.SignedInClient();
        await client.PostAsJsonAsync("/api/weights", new WeightInput(new DateOnly(2026, 1, 1), 70, null, null), Json, Ct);
        var run = new WorkoutInput(new DateOnly(2026, 1, 3), "Easy run", null, null,
            [new WorkoutExerciseInput(Running, null, null, [new SetInput(null, null, null, null, null, null, 1800, 5000, 145, false)])]);

        var w = await Read<WorkoutDto>(await client.PostAsJsonAsync("/api/workouts", run, Json, Ct));

        w.EstimatedCalories.Should().Be(343); // 9.8 * 70 * 0.5
        w.Exercises[0].Sets[0].PaceSecPerKm.Should().Be(360);
    }

    [Fact]
    public async Task Users_cannot_see_or_modify_each_others_data()
    {
        var alice = await api.SignedInClient();
        var bob = await api.SignedInClient();
        var workout = await Read<WorkoutDto>(await alice.PostAsJsonAsync("/api/workouts", BenchWorkout(new DateOnly(2026, 1, 2)), Json, Ct));

        (await bob.GetAsync($"/api/workouts/{workout.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await bob.DeleteAsync($"/api/workouts/{workout.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Read<List<WorkoutSummaryDto>>(await bob.GetAsync("/api/workouts", Ct))).Should().BeEmpty();

        var custom = await Read<ExerciseDto>(await alice.PostAsJsonAsync("/api/exercises", new CreateExercise("Sled Push", ExerciseCategory.Strength, null, 6), Json, Ct));
        var bobWorkout = new WorkoutInput(new DateOnly(2026, 1, 2), "x", null, null, [new WorkoutExerciseInput(custom.Id, null, null, [])]);
        (await bob.PostAsJsonAsync("/api/workouts", bobWorkout, Json, Ct)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Dashboard_summarises_weight_training_goal_and_calories()
    {
        var client = await api.SignedInClient();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await client.PutAsJsonAsync("/api/profile", new UpdateProfile("T", new DateOnly(1995, 5, 5), Sex.Female, 170, ActivityLevel.Light, UnitSystem.Metric, "UTC"), Json, Ct);
        await client.PostAsJsonAsync("/api/weights", new WeightInput(today.AddDays(-20), 70, null, null), Json, Ct);
        await client.PutAsJsonAsync("/api/goals", new GoalDto(GoalMode.Lose, 64, null, 0.5m, 2), Json, Ct);
        await client.PostAsJsonAsync("/api/weights", new WeightInput(today, 68, 25, null), Json, Ct);
        await client.PostAsJsonAsync("/api/workouts", BenchWorkout(today), Json, Ct);

        var d = await Read<DashboardDto>(await client.GetAsync("/api/dashboard", Ct));

        d.Weight.LatestKg.Should().Be(68);
        d.Weight.Change30dKg.Should().Be(-2);
        d.Weight.Series.Should().HaveCount(2);
        d.Goal.StartWeightKg.Should().Be(70);
        d.Goal.ProgressPercent.Should().Be(33);
        d.Training.WorkoutsThisWeek.Should().Be(1);
        d.Training.Weeks.Should().HaveCount(12);
        d.RecentRecords.Should().ContainSingle().Which.Reps.Should().Be(5);
        d.Calories.Should().NotBeNull();
        d.Calories!.Formula.Should().Be("KatchMcArdle");
        d.Goal.TargetDate.Should().BeNull();
        d.Goal.TargetDateFeasible.Should().BeNull();
        d.Goal.RequiredWeeklyRateKg.Should().BeNull();
    }

    [Fact]
    public async Task Goals_reject_contradictory_targets_past_dates_and_more_than_7_workouts()
    {
        var client = await api.SignedInClient();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await client.PostAsJsonAsync("/api/weights", new WeightInput(today, 120, null, null), Json, Ct);

        async Task<Dictionary<string, string[]>> Errors(GoalDto goal)
        {
            var res = await client.PutAsJsonAsync("/api/goals", goal, Json, Ct);
            res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            return (await Read<ValidationProblemDetails>(res)).Errors.ToDictionary();
        }

        (await Errors(new GoalDto(GoalMode.Lose, 125, null, 0.5m, 3)))["targetWeightKg"]
            .Should().Equal("For a loss goal, the target must be below your current weight (120 kg).");
        (await Errors(new GoalDto(GoalMode.Gain, 110, null, 0.25m, 3)))["targetWeightKg"]
            .Should().Equal("For a gain goal, the target must be above your current weight (120 kg).");
        (await Errors(new GoalDto(GoalMode.Lose, 100, today, 0.5m, 3))).Should().ContainKey("targetDate");
        (await Errors(new GoalDto(GoalMode.Lose, 100, null, 0.5m, 8))).Should().ContainKey("weeklyWorkoutTarget");

        (await client.PutAsJsonAsync("/api/goals", new GoalDto(GoalMode.Lose, 100, today.AddDays(1), 0.5m, 7), Json, Ct))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Dashboard_checks_the_target_date_and_hides_projection_for_a_contradictory_goal()
    {
        var client = await api.SignedInClient();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await client.PostAsJsonAsync("/api/weights", new WeightInput(today.AddDays(-1), 80, null, null), Json, Ct);
        await client.PutAsJsonAsync("/api/goals", new GoalDto(GoalMode.Lose, 76, today.AddDays(28), 0.5m, 3), Json, Ct);

        var goal = (await Read<DashboardDto>(await client.GetAsync("/api/dashboard", Ct))).Goal;
        goal.TargetDate.Should().Be(today.AddDays(28));
        goal.ProjectedDate.Should().Be(today.AddDays(56)); // 4 kg at 0.5 kg/week
        goal.TargetDateFeasible.Should().BeFalse();
        goal.RequiredWeeklyRateKg.Should().Be(1.0m);     // 4 kg in 4 weeks

        // The weight moved past the target: no "0% · By <date>".
        await client.PostAsJsonAsync("/api/weights", new WeightInput(today, 74, null, null), Json, Ct);
        goal = (await Read<DashboardDto>(await client.GetAsync("/api/dashboard", Ct))).Goal;
        goal.ProgressPercent.Should().BeNull();
        goal.ProjectedDate.Should().BeNull();
        goal.TargetDateFeasible.Should().BeNull();
        goal.RequiredWeeklyRateKg.Should().BeNull();
    }

    [Fact]
    public async Task Validation_messages_are_human_readable()
    {
        var client = await api.SignedInClient();

        var goal = await client.PutAsJsonAsync("/api/goals", new GoalDto(GoalMode.Maintain, 9999, null, 0, 3), Json, Ct);
        (await Read<ValidationProblemDetails>(goal)).Errors["targetWeightKg"].Should().Equal("Target weight must be between 20 and 400.");

        var workout = BenchWorkout(new DateOnly(2026, 1, 2), reps: 5000);
        var res = await client.PostAsJsonAsync("/api/workouts", workout, Json, Ct);
        (await Read<ValidationProblemDetails>(res)).Errors.Values.SelectMany(v => v)
            .Should().Contain("Reps must be between 0 and 1000.").And.NotContain(m => m.Contains('\'') || m.Contains("You entered"));
    }

    [Fact]
    public async Task Records_carry_the_most_reps_at_the_heaviest_weight_on_the_first_day_it_was_lifted()
    {
        var client = await api.SignedInClient();
        WorkoutInput Bench(DateOnly date, params (decimal Kg, int Reps)[] sets) => new(date, "Push", 60, null,
            [new WorkoutExerciseInput(BenchPress, null, null, sets.Select(s => new SetInput(s.Reps, s.Kg, null, null, null, null, null, null, null, false)).ToList())]);
        await client.PostAsJsonAsync("/api/workouts", Bench(new DateOnly(2026, 1, 2), (100, 5), (100, 8), (90, 12)), Json, Ct);
        await client.PostAsJsonAsync("/api/workouts", Bench(new DateOnly(2026, 1, 9), (100, 10)), Json, Ct);

        var record = (await Read<List<PersonalRecordDto>>(await client.GetAsync("/api/records", Ct))).Single(r => r.ExerciseId == BenchPress);
        record.BestWeightKg.Should().Be(100);
        record.BestWeightDate.Should().Be(new DateOnly(2026, 1, 2));
        record.BestWeightReps.Should().Be(8);
    }

    [Fact]
    public async Task Daily_check_in_upserts_by_date()
    {
        var client = await api.SignedInClient();
        await client.PutAsJsonAsync("/api/daily/2026-01-10", new DailyInput(8000, 7.5m, 55, 4, 2, 4, null), Json, Ct);
        await client.PutAsJsonAsync("/api/daily/2026-01-10", new DailyInput(9000, 7.5m, 55, 4, 2, 4, "felt good"), Json, Ct);

        var logs = await Read<List<DailyLogDto>>(await client.GetAsync("/api/daily?from=2026-01-01&to=2026-01-31", Ct));
        logs.Should().ContainSingle().Which.Steps.Should().Be(9000);
    }

    [Fact]
    public async Task Empty_daily_check_in_is_rejected()
    {
        var client = await api.SignedInClient();
        var res = await client.PutAsJsonAsync("/api/daily/2026-01-10", new DailyInput(null, null, null, null, null, null, "  "), Json, Ct);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await Read<ValidationProblemDetails>(res)).Detail.Should().Be("Fill in at least one value.");
    }

    [Fact]
    public async Task Export_contains_user_data()
    {
        var client = await api.SignedInClient();
        await client.PostAsJsonAsync("/api/weights", new WeightInput(new DateOnly(2026, 1, 1), 80, null, null), Json, Ct);
        await client.PostAsJsonAsync("/api/workouts", BenchWorkout(new DateOnly(2026, 1, 2)), Json, Ct);

        var res = await client.GetAsync("/api/account/export", Ct);
        res.Content.Headers.ContentDisposition!.FileName.Should().StartWith("fittrack-export-");
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(Ct));
        doc.RootElement.GetProperty("weights").GetArrayLength().Should().Be(1);
        doc.RootElement.GetProperty("workouts")[0].GetProperty("exercises")[0].GetProperty("sets").GetArrayLength().Should().Be(3);

        var csv = await client.GetStringAsync("/api/weights/export.csv", Ct);
        csv.Should().StartWith("date,weight_kg").And.Contain("2026-01-01,80");
    }

    [Fact]
    public async Task Account_deletion_requires_password_and_removes_everything()
    {
        var client = await api.SignedInClient("Sup3rSecret!");
        await client.PostAsJsonAsync("/api/weights", new WeightInput(new DateOnly(2026, 1, 1), 80, null, null), Json, Ct);
        var custom = await Read<ExerciseDto>(await client.PostAsJsonAsync("/api/exercises", new CreateExercise("Sled Push", ExerciseCategory.Strength, null, 6), Json, Ct));
        var workout = new WorkoutInput(new DateOnly(2026, 1, 2), "x", 30, null,
            [new WorkoutExerciseInput(custom.Id, null, null, [new SetInput(10, 50, null, null, null, null, null, null, null, false)])]);
        await client.PostAsJsonAsync("/api/workouts", workout, Json, Ct);
        await client.PostAsJsonAsync("/api/templates", new TemplateInput("T", null, [new TemplateItemInput(custom.Id, 3, 10, 50)]), Json, Ct);

        (await client.PostAsJsonAsync("/api/account/delete", new DeleteAccountRequest("nope"), Json, Ct))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await client.PostAsJsonAsync("/api/account/delete", new DeleteAccountRequest("Sup3rSecret!"), Json, Ct))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await client.GetAsync("/api/auth/me", Ct)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Custom_exercise_in_use_cannot_be_deleted()
    {
        var client = await api.SignedInClient();
        var custom = await Read<ExerciseDto>(await client.PostAsJsonAsync("/api/exercises", new CreateExercise("Sled Push", ExerciseCategory.Strength, null, 6), Json, Ct));
        await client.PostAsJsonAsync("/api/templates", new TemplateInput("T", null, [new TemplateItemInput(custom.Id, 3, 10, null)]), Json, Ct);

        (await client.DeleteAsync($"/api/exercises/{custom.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await client.DeleteAsync($"/api/exercises/{BenchPress}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound, "built-ins are read-only");
    }

    [Fact]
    public async Task Calculator_returns_estimate()
    {
        var client = await api.SignedInClient();
        var res = await client.PostAsJsonAsync("/api/calculator",
            new CalorieInput(Sex.Male, 30, 180, 80, null, ActivityLevel.Moderate, GoalMode.Maintain, 0, null), Json, Ct);

        (await Read<CalorieResult>(res)).Tdee.Should().Be(2759);
    }
}
