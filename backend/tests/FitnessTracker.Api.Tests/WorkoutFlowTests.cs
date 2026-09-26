using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FitnessTracker.Api.Features;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace FitnessTracker.Api.Tests;

/// <summary>Workout flow v2 (docs/workout-flow.md): templates, plan, live sessions, logged-activity calories.</summary>
[Collection(nameof(ApiCollection))]
public class WorkoutFlowTests(ApiFactory api)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(), new HourMinuteConverter() },
    };
    private static readonly Guid Bench = ExerciseSeed.IdFor("Bench Press");
    private static readonly Guid Squat = ExerciseSeed.IdFor("Back Squat");
    private static readonly Guid Ohp = ExerciseSeed.IdFor("Overhead Press");
    private static readonly Guid Deadlift = ExerciseSeed.IdFor("Deadlift");
    private static readonly Guid Running = ExerciseSeed.IdFor("Running");
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow); // test users stay on UTC
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<T> Read<T>(HttpResponseMessage res)
    {
        if (!res.IsSuccessStatusCode) throw new InvalidOperationException($"{(int)res.StatusCode}: {await res.Content.ReadAsStringAsync(Ct)}");
        return (await res.Content.ReadFromJsonAsync<T>(Json, Ct))!;
    }

    private static Task<HttpResponseMessage> Post<T>(HttpClient c, string url, T body) => c.PostAsJsonAsync(url, body, Json, Ct);
    private static Task<HttpResponseMessage> Put<T>(HttpClient c, string url, T body) => c.PutAsJsonAsync(url, body, Json, Ct);

    private static async Task<TemplateDto> CreateTemplate(HttpClient c, string name = "Push", params TemplateItemInput[] items) =>
        await Read<TemplateDto>(await Post(c, "/api/templates",
            new TemplateInput(name, null, items.Length > 0 ? [.. items] : [new TemplateItemInput(Bench, 3, 5, 60)])));

    private static WorkoutInput Lift(DateOnly date, Guid exercise, decimal weight, int reps = 5, Guid? planEntryId = null) =>
        new(date, "Lift", 60, null,
            [new WorkoutExerciseInput(exercise, null, null, [new SetInput(reps, weight, null, null, null, null, null, null, null, false)])],
            PlanEntryId: planEntryId);

    [Fact]
    public async Task Templates_support_crud_duplicate_and_rest_days()
    {
        var c = await api.SignedInClient();
        var created = await Post(c, "/api/templates", new TemplateInput("Upper A", "Heavy day",
        [
            new TemplateItemInput(Bench, 4, 6, null, TargetPercent1Rm: 80, RestSeconds: 180, Tempo: "3-1-1-0", Rpe: 8, Rir: 2, Notes: "pause", Group: 1, GroupType: GroupType.Superset),
            new TemplateItemInput(Ohp, 3, 8, 40, Group: 1, GroupType: GroupType.Superset),
        ]));
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var t = await Read<TemplateDto>(created);
        t.Kind.Should().Be(TemplateKind.Workout);
        t.Description.Should().Be("Heavy day");
        t.Exercises[0].Should().BeEquivalentTo(new { ExerciseName = "Bench Press", Category = ExerciseCategory.Strength, TargetPercent1Rm = 80m, Tempo = "3-1-1-0", GroupType = GroupType.Superset });
        t.Exercises[1].TargetWeightKg.Should().Be(40);

        var updated = await Read<TemplateDto>(await Put(c, $"/api/templates/{t.Id}", new TemplateInput("Upper B", null, [new TemplateItemInput(Bench, 5, 5, 80)])));
        updated.Name.Should().Be("Upper B");
        updated.Exercises.Should().ContainSingle().Which.TargetWeightKg.Should().Be(80);

        var copyRes = await c.PostAsync($"/api/templates/{t.Id}/duplicate", null, Ct);
        copyRes.StatusCode.Should().Be(HttpStatusCode.Created);
        var copy = await Read<TemplateDto>(copyRes);
        copy.Id.Should().NotBe(t.Id);
        copy.Name.Should().Be("Upper B (copy)");
        copy.Exercises.Should().BeEquivalentTo(updated.Exercises);

        (await Post(c, "/api/templates", new TemplateInput("Rest", null, [new TemplateItemInput(Bench, 1, 1, null)], TemplateKind.RestDay)))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await Post(c, "/api/templates", new TemplateInput("Empty", null, [])))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest, "a workout template needs exercises");
        (await Post(c, "/api/templates", new TemplateInput("Bad", null, [new TemplateItemInput(Bench, 3, 5, null, TargetPercent1Rm: 150)])))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var rest = await Read<TemplateDto>(await Post(c, "/api/templates", new TemplateInput("Rest", null, [], TemplateKind.RestDay)));
        rest.Kind.Should().Be(TemplateKind.RestDay);

        var all = await Read<List<TemplateDto>>(await c.GetAsync("/api/templates", Ct));
        all.Select(x => x.Name).Should().Equal("Rest", "Upper B", "Upper B (copy)");

        (await c.DeleteAsync($"/api/templates/{copy.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await c.DeleteAsync($"/api/templates/{copy.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Pre_v2_template_rows_still_read_with_weight_as_target()
    {
        var c = await api.SignedInClient();
        var me = await Read<Me>(await c.GetAsync("/api/auth/me", Ct));
        using (var scope = api.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.ExecuteSqlAsync($"""
                INSERT INTO "Templates" ("Id", "UserId", "Name", "Notes", "Exercises")
                VALUES ({Guid.CreateVersion7()}, {me.Id}, 'Legacy', 'old notes',
                        {$"[{{\"ExerciseId\":\"{Bench}\",\"Sets\":3,\"Reps\":5,\"WeightKg\":70}}]"}::jsonb)
                """, Ct);
        }

        var t = (await Read<List<TemplateDto>>(await c.GetAsync("/api/templates", Ct))).Single();
        t.Should().BeEquivalentTo(new { Name = "Legacy", Description = "old notes", Kind = TemplateKind.Workout });
        t.Exercises.Single().Should().BeEquivalentTo(new { Sets = 3, Reps = (int?)5, TargetWeightKg = (decimal?)70m, TargetPercent1Rm = (decimal?)null });
    }

    [Fact]
    public async Task Plan_schedules_single_and_recurring_entries_and_protects_completed_ones()
    {
        var c = await api.SignedInClient();
        var t = await CreateTemplate(c);
        var start = new DateOnly(2030, 1, 7); // a Monday

        var singleRes = await Post(c, "/api/plan", new CreatePlanEntry(t.Id, start.AddDays(-1), "deload"));
        singleRes.StatusCode.Should().Be(HttpStatusCode.Created);
        var single = await Read<PlanEntryDto>(singleRes);
        single.Should().BeEquivalentTo(new { TemplateName = "Push", Kind = (TemplateKind?)TemplateKind.Workout, Status = PlanStatus.Planned, Note = "deload", SeriesId = (Guid?)null });

        var seriesRes = await Post(c, "/api/plan/recurring", new CreateRecurringPlan(t.Id, start, [DayOfWeek.Monday, DayOfWeek.Thursday], 3, null));
        seriesRes.StatusCode.Should().Be(HttpStatusCode.Created);
        var series = await Read<List<PlanEntryDto>>(seriesRes);
        series.Select(e => e.Date).Should().Equal(start, start.AddDays(3), start.AddDays(7), start.AddDays(10), start.AddDays(14), start.AddDays(17));
        series.Select(e => e.SeriesId).Distinct().Should().ContainSingle().Which.Should().NotBeNull();
        var seriesId = series[0].SeriesId!.Value;

        (await Post(c, "/api/plan/recurring", new CreateRecurringPlan(t.Id, start, [DayOfWeek.Monday, DayOfWeek.Monday], 3, null)))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.GetAsync("/api/plan", Ct)).StatusCode.Should().Be(HttpStatusCode.BadRequest, "from/to are required");
        (await c.GetAsync("/api/plan?from=2030-01-01&to=2031-06-01", Ct)).StatusCode.Should().Be(HttpStatusCode.BadRequest, "span is capped");

        var skipped = await Read<PlanEntryDto>(await Put(c, $"/api/plan/{series[1].Id}", new UpdatePlanEntry(series[1].Date, t.Id, "sick", PlanStatus.Skipped)));
        skipped.Status.Should().Be(PlanStatus.Skipped);
        (await Put(c, $"/api/plan/{series[1].Id}", new UpdatePlanEntry(series[1].Date, t.Id, null, PlanStatus.Completed)))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // Manual log completes the entry.
        var logged = await Read<WorkoutDto>(await Post(c, "/api/workouts", Lift(series[0].Date, Bench, 60, planEntryId: series[0].Id) with { TemplateId = t.Id }));
        logged.PlanEntryId.Should().Be(series[0].Id);
        logged.Type.Should().Be(WorkoutType.Strength);
        var range = await Read<List<PlanEntryDto>>(await c.GetAsync("/api/plan?from=2030-01-01&to=2030-02-01", Ct));
        range.Should().HaveCount(7).And.BeInAscendingOrder(e => e.Date);
        range.Single(e => e.Id == series[0].Id).Should().BeEquivalentTo(new { Status = PlanStatus.Completed, WorkoutId = (Guid?)logged.Id });
        (await Read<PlanEntryDto>(await c.GetAsync($"/api/plan/{series[0].Id}", Ct))).Status.Should().Be(PlanStatus.Completed);
        (await Post(c, "/api/workouts", Lift(series[0].Date, Bench, 60, planEntryId: series[0].Id)))
            .StatusCode.Should().Be(HttpStatusCode.Conflict, "an entry is completed once");

        (await Put(c, $"/api/plan/{series[0].Id}", new UpdatePlanEntry(series[0].Date, t.Id, null, PlanStatus.Planned)))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await c.DeleteAsync($"/api/plan/{series[0].Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.Conflict);

        var deleted = await Read<DeletedCount>(await c.DeleteAsync($"/api/plan/series/{seriesId}?from={start:yyyy-MM-dd}", Ct));
        deleted.Deleted.Should().Be(5, "the completed entry is history");

        // Template delete removes planned entries but keeps history.
        (await c.DeleteAsync($"/api/templates/{t.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var left = await Read<List<PlanEntryDto>>(await c.GetAsync("/api/plan?from=2030-01-01&to=2030-02-01", Ct));
        left.Should().ContainSingle().Which.Should().BeEquivalentTo(new { Id = series[0].Id, TemplateId = (Guid?)null, Status = PlanStatus.Completed });
        (await Read<WorkoutDto>(await c.GetAsync($"/api/workouts/{logged.Id}", Ct))).TemplateId.Should().BeNull();

        (await c.DeleteAsync($"/api/plan/{single.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound, "deleted with its template");
    }

    [Fact]
    public async Task Deleting_a_logged_workout_reopens_its_plan_entry()
    {
        var c = await api.SignedInClient();
        var t = await CreateTemplate(c);
        var entry = await Read<PlanEntryDto>(await Post(c, "/api/plan", new CreatePlanEntry(t.Id, Today, null)));
        var w = await Read<WorkoutDto>(await Post(c, "/api/workouts", Lift(Today, Bench, 60, planEntryId: entry.Id)));

        (await c.DeleteAsync($"/api/workouts/{w.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var e = (await Read<List<PlanEntryDto>>(await c.GetAsync($"/api/plan?from={Today:yyyy-MM-dd}&to={Today:yyyy-MM-dd}", Ct))).Single();
        e.Status.Should().Be(PlanStatus.Planned);
        e.WorkoutId.Should().BeNull();
    }

    [Fact]
    public async Task Session_from_plan_resolves_targets_logs_sets_and_finishes_into_a_workout()
    {
        var c = await api.SignedInClient();
        await Post(c, "/api/weights", new WeightInput(Today.AddDays(-30), 80, null, null));
        // History: bench 100x5 (e1RM 116.7), OHP last used at 50 kg.
        await Post(c, "/api/workouts", new WorkoutInput(Today.AddDays(-10), "Old", 60, null,
        [
            new WorkoutExerciseInput(Bench, null, null, [new SetInput(5, 100, null, null, null, null, null, null, null, false)]),
            new WorkoutExerciseInput(Ohp, null, null,
            [
                new SetInput(5, 45, null, null, null, null, null, null, null, false),
                new SetInput(5, 50, null, null, null, null, null, null, null, false),
                new SetInput(10, 20, null, null, null, null, null, null, null, IsWarmup: true),
            ]),
        ]));
        var t = await CreateTemplate(c, "Push",
            new TemplateItemInput(Bench, 2, 5, null, TargetPercent1Rm: 80, RestSeconds: 120, Rpe: 8),
            new TemplateItemInput(Squat, 2, 5, 100, TargetPercent1Rm: 50),
            new TemplateItemInput(Ohp, 1, 5, null),
            new TemplateItemInput(Deadlift, 1, 5, null));
        var entry = await Read<PlanEntryDto>(await Post(c, "/api/plan", new CreatePlanEntry(t.Id, Today, null)));

        var startRes = await Post(c, "/api/sessions", new StartSession(entry.Id, null, null));
        startRes.StatusCode.Should().Be(HttpStatusCode.Created);
        var s = await Read<SessionDto>(startRes);
        s.Name.Should().Be("Push");
        s.PlanEntryId.Should().Be(entry.Id);
        s.TemplateId.Should().Be(t.Id);
        s.Exercises.Select(e => e.Sets.Count).Should().Equal(2, 2, 1, 1);
        s.Exercises[0].Sets[0].Should().BeEquivalentTo(new { TargetReps = (int?)5, TargetWeightKg = (decimal?)92.5m, TargetRpe = (decimal?)8m, Done = false }); // 0.8 × 116.7 → 92.5
        s.Exercises[0].RestSeconds.Should().Be(120);
        s.Exercises[1].Sets[0].TargetWeightKg.Should().Be(100, "an explicit weight wins over %1RM");
        s.Exercises[2].Sets[0].TargetWeightKg.Should().Be(50, "last logged working set");
        s.Exercises[3].Sets[0].TargetWeightKg.Should().BeNull();
        s.Exercises.SelectMany(e => e.Sets).Select(x => x.Id).Should().OnlyHaveUniqueItems();

        var second = await Post(c, "/api/sessions", new StartSession(null, null, "Other"));
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await second.Content.ReadFromJsonAsync<SessionDto>(Json, Ct))!.Id.Should().Be(s.Id);

        // Log: bench set at 105 kg; OHP checked off with its targets.
        var bench = s.Exercises[0];
        var afterLog = await Read<SessionDto>(await Post(c, $"/api/sessions/{s.Id}/log", new LogSetInput(bench.Id, bench.Sets[0].Id, 5, 105, 9, null, null, null, true)));
        afterLog.Exercises[0].Sets[0].Should().BeEquivalentTo(new { Reps = (int?)5, WeightKg = (decimal?)105m, Done = true });
        var ohp = s.Exercises[2];
        await Read<SessionDto>(await Post(c, $"/api/sessions/{s.Id}/log", new LogSetInput(ohp.Id, ohp.Sets[0].Id, null, null, null, null, null, null, true)));
        (await Post(c, $"/api/sessions/{s.Id}/log", new LogSetInput(ohp.Id, "nope", 1, 1, null, null, null, null, true)))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);

        // Autosave: skip squats, add a run with client ids.
        var current = await Read<SessionDto>(await c.GetAsync("/api/sessions/active", Ct));
        var exercises = current.Exercises.Select(e => e.ExerciseId == Squat ? e with { Skipped = true, Sets = [.. e.Sets.Select(x => x with { Done = true })] } : e).ToList();
        exercises.Add(new SessionExercise("run-1", Running, null, ExerciseCategory.Strength, null, null, null, null, null, false,
            [new SessionSet("run-1-a", null, null, null, null, null, null, null, 1200, 3000, false, true)]));
        var saved = await Read<SessionDto>(await Put(c, $"/api/sessions/{s.Id}", new SessionInput("Push + run", "felt strong", exercises)));
        saved.Exercises.Should().HaveCount(5);
        saved.Exercises[4].Should().BeEquivalentTo(new { Id = "run-1", ExerciseName = "Running", Category = ExerciseCategory.Cardio });
        saved.Exercises[0].Sets[0].Done.Should().BeTrue("autosave kept the logged set");

        var finishRes = await Post(c, $"/api/sessions/{s.Id}/finish", new FinishSession(null, 45));
        finishRes.StatusCode.Should().Be(HttpStatusCode.Created);
        var summary = await Read<SessionSummary>(finishRes);

        summary.SetsDone.Should().Be(3, "skipped exercises and open sets are dropped");
        summary.DurationMinutes.Should().Be(45);
        summary.TotalVolumeKg.Should().Be(105 * 5 + 50 * 5);
        summary.EstimatedCalories.Should().NotBeNull();
        summary.WorkoutsThisWeek.Should().BeGreaterThanOrEqualTo(1);
        summary.WeeklyTarget.Should().Be(3);
        summary.NextPlan.Should().BeNull();

        var w = summary.Workout;
        w.Name.Should().Be("Push + run");
        w.Notes.Should().Be("felt strong");
        w.Date.Should().Be(Today);
        w.StartTime.Should().NotBeNull();
        w.Type.Should().Be(WorkoutType.Strength);
        w.TemplateId.Should().Be(t.Id);
        w.PlanEntryId.Should().Be(entry.Id);
        w.Exercises.Select(e => e.ExerciseId).Should().Equal(Bench, Ohp, Running);
        w.Exercises[1].Sets.Single().Should().BeEquivalentTo(new { Reps = (int?)5, WeightKg = (decimal?)50m }, "null actuals fall back to targets");
        w.Exercises[0].Sets.Single().RestSeconds.Should().Be(120);

        summary.Prs.Should().BeEquivalentTo(new[]
        {
            new SessionPr(Bench, "Bench Press", "Weight", 105, 100),
            new SessionPr(Bench, "Bench Press", "E1rm", 122.5m, 116.7m),
        }, "OHP only matched its best and cardio has no records");

        var done = (await Read<List<PlanEntryDto>>(await c.GetAsync($"/api/plan?from={Today:yyyy-MM-dd}&to={Today:yyyy-MM-dd}", Ct))).Single();
        done.Status.Should().Be(PlanStatus.Completed);
        done.WorkoutId.Should().Be(w.Id);
        (await c.GetAsync("/api/sessions/active", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await c.GetAsync($"/api/workouts/{w.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Finishing_without_done_sets_is_rejected_and_discard_removes_the_session()
    {
        var c = await api.SignedInClient();
        var s = await Read<SessionDto>(await Post(c, "/api/sessions", new StartSession(null, null, null)));
        s.Name.Should().Be("Workout");
        s.Exercises.Should().BeEmpty();

        var res = await Post(c, $"/api/sessions/{s.Id}/finish", new FinishSession(null, null));
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await res.Content.ReadAsStringAsync(Ct)).Should().Contain("Log at least one set before finishing.");

        (await c.DeleteAsync($"/api/sessions/{s.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await c.GetAsync("/api/sessions/active", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Rest_days_and_skipped_entries_cannot_be_started()
    {
        var c = await api.SignedInClient();
        var rest = await Read<TemplateDto>(await Post(c, "/api/templates", new TemplateInput("Rest", null, [], TemplateKind.RestDay)));
        var restEntry = await Read<PlanEntryDto>(await Post(c, "/api/plan", new CreatePlanEntry(rest.Id, Today, null)));

        (await Post(c, "/api/sessions", new StartSession(restEntry.Id, null, null))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await Post(c, "/api/sessions", new StartSession(null, rest.Id, null))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await Read<NextPlanDto>(await c.GetAsync("/api/plan/next", Ct))).Entry.Should().BeNull("rest days are skipped");
    }

    [Fact]
    public async Task Calculator_uses_logged_exercise_calories_on_a_sedentary_base()
    {
        var c = await api.SignedInClient();
        var r = await Read<CalorieResult>(await Post(c, "/api/calculator",
            new CalorieInput(Sex.Male, 30, 180, 80, null, ActivityLevel.VeryActive, GoalMode.Maintain, 0, null, ExerciseKcalPerDay: 300)));

        r.Tdee.Should().Be(2436); // 1780 × 1.2 + 300
        r.ActivitySource.Should().Be("LoggedWorkouts");
        r.ExerciseKcalPerDay.Should().Be(300);

        (await Post(c, "/api/calculator", new CalorieInput(Sex.Male, 30, 180, 80, null, ActivityLevel.Moderate, GoalMode.Maintain, 0, null, 5000)))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await Read<CalorieResult>(await Post(c, "/api/calculator", new CalorieInput(Sex.Male, 30, 180, 80, null, ActivityLevel.Moderate, GoalMode.Maintain, 0, null))))
            .ActivitySource.Should().Be("ActivityLevel");
    }

    [Fact]
    public async Task Dashboard_reports_next_plan_planned_week_and_logged_activity_calories()
    {
        var c = await api.SignedInClient();
        var profile = new UpdateProfile("T", new DateOnly(1990, 1, 1), Sex.Male, 180, ActivityLevel.Moderate, UnitSystem.Metric, "UTC", UseLoggedActivity: true);
        (await Read<ProfileDto>(await Put(c, "/api/profile", profile))).UseLoggedActivity.Should().BeTrue();
        await Post(c, "/api/weights", new WeightInput(Today.AddDays(-1), 70, null, null));
        await Post(c, "/api/workouts", new WorkoutInput(Today, "Run", null, null,
            [new WorkoutExerciseInput(Running, null, null, [new SetInput(null, null, null, null, null, null, 1800, 5000, null, false)])]));
        await Post(c, "/api/workouts", new WorkoutInput(Today.AddDays(-40), "Old run", null, null,
            [new WorkoutExerciseInput(Running, null, null, [new SetInput(null, null, null, null, null, null, 1800, 5000, null, false)])]));
        var t = await CreateTemplate(c);
        var entry = await Read<PlanEntryDto>(await Post(c, "/api/plan", new CreatePlanEntry(t.Id, Today, null)));

        var d = await Read<DashboardDto>(await c.GetAsync("/api/dashboard", Ct));

        d.Training.AvgExerciseKcalPerDay.Should().Be(12); // 343 kcal (9.8 × 70 × 0.5 h) / 28, the 40-day-old run excluded
        d.Training.PlannedThisWeek.Should().Be(1);
        d.Training.CompletedPlannedThisWeek.Should().Be(0);
        d.NextPlan!.Id.Should().Be(entry.Id);
        d.Calories!.ActivitySource.Should().Be("LoggedWorkouts");
        d.Calories.ExerciseKcalPerDay.Should().Be(12);
        (await Read<NextPlanDto>(await c.GetAsync("/api/plan/next", Ct))).Entry!.Id.Should().Be(entry.Id);
    }

    [Fact]
    public async Task Plan_and_sessions_are_isolated_per_user()
    {
        var alice = await api.SignedInClient();
        var bob = await api.SignedInClient();
        var t = await CreateTemplate(alice);
        var entry = await Read<PlanEntryDto>(await Post(alice, "/api/plan", new CreatePlanEntry(t.Id, Today, null)));
        var s = await Read<SessionDto>(await Post(alice, "/api/sessions", new StartSession(null, t.Id, null)));

        (await Read<List<PlanEntryDto>>(await bob.GetAsync($"/api/plan?from={Today:yyyy-MM-dd}&to={Today:yyyy-MM-dd}", Ct))).Should().BeEmpty();
        (await bob.GetAsync($"/api/plan/{entry.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Put(bob, $"/api/plan/{entry.Id}", new UpdatePlanEntry(Today, t.Id, null, PlanStatus.Skipped))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await bob.DeleteAsync($"/api/plan/{entry.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Post(bob, "/api/plan", new CreatePlanEntry(t.Id, Today, null))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await bob.PostAsync($"/api/templates/{t.Id}/duplicate", null, Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Post(bob, "/api/workouts", Lift(Today, Bench, 60, planEntryId: entry.Id))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await bob.GetAsync("/api/sessions/active", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Put(bob, $"/api/sessions/{s.Id}", new SessionInput("x", null, []))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Post(bob, $"/api/sessions/{s.Id}/log", new LogSetInput(s.Exercises[0].Id, s.Exercises[0].Sets[0].Id, 1, 1, null, null, null, null, true)))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Post(bob, $"/api/sessions/{s.Id}/finish", new FinishSession(null, null))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await bob.DeleteAsync($"/api/sessions/{s.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Post(bob, "/api/sessions", new StartSession(entry.Id, null, null))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await alice.GetAsync("/api/sessions/active", Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Account_deletion_removes_plan_sessions_and_history()
    {
        var c = await api.SignedInClient("Sup3rSecret!");
        var t = await CreateTemplate(c);
        var entry = await Read<PlanEntryDto>(await Post(c, "/api/plan", new CreatePlanEntry(t.Id, Today, null)));
        await Post(c, "/api/workouts", Lift(Today, Bench, 60, planEntryId: entry.Id) with { TemplateId = t.Id });
        await Post(c, "/api/plan/recurring", new CreateRecurringPlan(t.Id, Today, [DayOfWeek.Monday], 2, null));
        await Post(c, "/api/sessions", new StartSession(null, t.Id, null));

        var export = JsonDocument.Parse(await c.GetStringAsync("/api/account/export", Ct)).RootElement;
        export.GetProperty("plan").GetArrayLength().Should().Be(3);
        export.GetProperty("templates")[0].GetProperty("kind").GetString().Should().Be("Workout");

        (await Post(c, "/api/account/delete", new DeleteAccountRequest("Sup3rSecret!"))).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }
}
