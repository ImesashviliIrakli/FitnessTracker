using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace FitnessTracker.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AspNetRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ConcurrencyStamp = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetRoles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUsers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    DateOfBirth = table.Column<DateOnly>(type: "date", nullable: true),
                    Sex = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    HeightCm = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    ActivityLevel = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    UnitSystem = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    GoalMode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    TargetWeightKg = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    TargetDate = table.Column<DateOnly>(type: "date", nullable: true),
                    WeeklyRateKg = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: false),
                    WeeklyWorkoutTarget = table.Column<int>(type: "integer", nullable: false),
                    GoalStartWeightKg = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    UserName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedUserName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    EmailConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: true),
                    SecurityStamp = table.Column<string>(type: "text", nullable: true),
                    ConcurrencyStamp = table.Column<string>(type: "text", nullable: true),
                    PhoneNumber = table.Column<string>(type: "text", nullable: true),
                    PhoneNumberConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    TwoFactorEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    LockoutEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LockoutEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AccessFailedCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUsers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DataProtectionKeys",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FriendlyName = table.Column<string>(type: "text", nullable: true),
                    Xml = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataProtectionKeys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AspNetRoleClaims",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimType = table.Column<string>(type: "text", nullable: true),
                    ClaimValue = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetRoleClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AspNetRoleClaims_AspNetRoles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "AspNetRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserClaims",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimType = table.Column<string>(type: "text", nullable: true),
                    ClaimValue = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AspNetUserClaims_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserLogins",
                columns: table => new
                {
                    LoginProvider = table.Column<string>(type: "text", nullable: false),
                    ProviderKey = table.Column<string>(type: "text", nullable: false),
                    ProviderDisplayName = table.Column<string>(type: "text", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserLogins", x => new { x.LoginProvider, x.ProviderKey });
                    table.ForeignKey(
                        name: "FK_AspNetUserLogins_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserRoles",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserRoles", x => new { x.UserId, x.RoleId });
                    table.ForeignKey(
                        name: "FK_AspNetUserRoles_AspNetRoles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "AspNetRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AspNetUserRoles_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserTokens",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LoginProvider = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Value = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserTokens", x => new { x.UserId, x.LoginProvider, x.Name });
                    table.ForeignKey(
                        name: "FK_AspNetUserTokens_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DailyLogs",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Steps = table.Column<int>(type: "integer", nullable: true),
                    SleepHours = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    RestingHeartRate = table.Column<int>(type: "integer", nullable: true),
                    Energy = table.Column<int>(type: "integer", nullable: true),
                    Soreness = table.Column<int>(type: "integer", nullable: true),
                    Mood = table.Column<int>(type: "integer", nullable: true),
                    Note = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyLogs", x => new { x.UserId, x.Date });
                    table.ForeignKey(
                        name: "FK_DailyLogs_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Exercises",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Category = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    PrimaryMuscle = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Met = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Exercises", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Exercises_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Measurements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    WaistCm = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    ChestCm = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    HipsCm = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    ArmCm = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    ThighCm = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    NeckCm = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    ShouldersCm = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    Note = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Measurements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Measurements_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Templates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    Exercises = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Templates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Templates_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Weights",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    WeightKg = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: false),
                    BodyFatPercent = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    Note = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Weights", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Weights_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Workouts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workouts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Workouts_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkoutExercise",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkoutId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    ExerciseId = table.Column<Guid>(type: "uuid", nullable: false),
                    SupersetGroup = table.Column<int>(type: "integer", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkoutExercise", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkoutExercise_Exercises_ExerciseId",
                        column: x => x.ExerciseId,
                        principalTable: "Exercises",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_WorkoutExercise_Workouts_WorkoutId",
                        column: x => x.WorkoutId,
                        principalTable: "Workouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkoutSet",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkoutExerciseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    Reps = table.Column<int>(type: "integer", nullable: true),
                    WeightKg = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    Rpe = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    Rir = table.Column<int>(type: "integer", nullable: true),
                    RestSeconds = table.Column<int>(type: "integer", nullable: true),
                    Tempo = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    DistanceM = table.Column<decimal>(type: "numeric(9,2)", precision: 9, scale: 2, nullable: true),
                    AvgHeartRate = table.Column<int>(type: "integer", nullable: true),
                    IsWarmup = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkoutSet", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkoutSet_WorkoutExercise_WorkoutExerciseId",
                        column: x => x.WorkoutExerciseId,
                        principalTable: "WorkoutExercise",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "Exercises",
                columns: new[] { "Id", "Category", "Met", "Name", "PrimaryMuscle", "UserId" },
                values: new object[,]
                {
                    { new Guid("01be96d5-3d4b-631e-8b50-7f0d4092c693"), "Cardio", 8.5m, "Indoor Cycling", null, null },
                    { new Guid("047619de-efdd-b005-a4c2-200db9441caf"), "Strength", 3.5m, "Lat Pulldown", "Back", null },
                    { new Guid("076a382c-2e44-8dd9-d910-7b0ae66e2f83"), "Cardio", 9.8m, "Running", null, null },
                    { new Guid("0982c38b-08d0-0367-ecef-b2dcd96647fe"), "Strength", 6.0m, "Deadlift", "Posterior chain", null },
                    { new Guid("0da3071f-12d2-aea7-a5f8-a5003db4a7c7"), "Strength", 3.5m, "Triceps Pushdown", "Triceps", null },
                    { new Guid("0e790be3-c845-636b-4423-8babd2185406"), "Mobility", 2.5m, "Yoga", null, null },
                    { new Guid("105c27a6-fcfd-5679-14d9-8957914c388b"), "Strength", 5.0m, "Walking Lunge", "Quads", null },
                    { new Guid("113a3b2b-1443-01d9-7cb0-f9343514d57e"), "Strength", 3.5m, "Leg Curl", "Hamstrings", null },
                    { new Guid("1348ac7e-1652-596d-3cd3-57a25a1178c0"), "Cardio", 3.5m, "Walking", null, null },
                    { new Guid("13cadc3b-47dd-d1d8-a594-c0fc01bae2aa"), "Strength", 5.0m, "Incline Dumbbell Press", "Chest", null },
                    { new Guid("1942bc9c-30fc-10ce-962f-b20cf8beae08"), "Mobility", 3.0m, "Pilates", null, null },
                    { new Guid("1c7e699d-0760-2f06-0d94-84c7ef08dd4b"), "Sport", 10.3m, "Martial Arts", null, null },
                    { new Guid("1ee70556-0f32-bdda-9718-e522d2bbf71e"), "Mobility", 2.0m, "Foam Rolling", null, null },
                    { new Guid("21c4703e-f3cc-940d-f9b9-391b10d1274a"), "Strength", 5.0m, "Overhead Press", "Shoulders", null },
                    { new Guid("2f237912-b50f-915d-eac8-f89ef40f510c"), "Strength", 3.5m, "Seated Cable Row", "Back", null },
                    { new Guid("375eaa67-b4bc-d76a-ca25-b87884b90be9"), "Cardio", 6.0m, "Hiking", null, null },
                    { new Guid("3a929b51-cbad-a3b6-82f7-7e5b95501ec1"), "Sport", 8.0m, "Climbing", null, null },
                    { new Guid("462f7318-30d8-5a4a-050e-7657a4450efc"), "Cardio", 9.0m, "Stair Climber", null, null },
                    { new Guid("49424685-8a45-192e-2dc2-f379ce3c7f38"), "Cardio", 5.0m, "Elliptical", null, null },
                    { new Guid("59b8e16e-c045-e269-ad94-79587ba90dda"), "Strength", 5.0m, "Back Squat", "Quads", null },
                    { new Guid("68537c73-ddb6-b215-c213-25b6a26bd649"), "Strength", 5.0m, "Barbell Row", "Back", null },
                    { new Guid("69090f0d-ef4a-7fe6-8ced-a713c2ceb2f5"), "Cardio", 7.5m, "Cycling", null, null },
                    { new Guid("6e5ee588-a24a-a391-7973-6748b628b70e"), "Strength", 5.0m, "Hip Thrust", "Glutes", null },
                    { new Guid("74f3929d-f1b4-04b0-c7c5-31607dc6d349"), "Strength", 3.5m, "Dumbbell Curl", "Biceps", null },
                    { new Guid("7a3ab71f-e744-4379-b107-be0dea81689e"), "Strength", 5.0m, "Leg Press", "Quads", null },
                    { new Guid("7ade63e8-6a65-da98-4074-f825db903007"), "Strength", 3.5m, "Leg Extension", "Quads", null },
                    { new Guid("7e3aca25-c12a-410e-fd2f-89898af2bdb9"), "Strength", 3.5m, "Face Pull", "Rear delts", null },
                    { new Guid("846ec2fc-c485-a9e8-160e-873e21e387b7"), "Mobility", 2.3m, "Stretching", null, null },
                    { new Guid("86d5f865-a46b-c316-5dd5-3ff896550501"), "Strength", 3.5m, "Calf Raise", "Calves", null },
                    { new Guid("88c24f51-0dfa-8099-5d7d-f044b4ed72e2"), "Strength", 3.8m, "Plank", "Core", null },
                    { new Guid("99cef9a6-04b5-1278-a7ac-27405763710f"), "Cardio", 11.8m, "Jump Rope", null, null },
                    { new Guid("9b346e5e-60e8-3b56-5b3c-b4976b8c0e0a"), "Strength", 5.0m, "Front Squat", "Quads", null },
                    { new Guid("9b4e6c35-f869-bd50-4117-1e7de558a90d"), "Cardio", 5.8m, "Swimming", null, null },
                    { new Guid("a4e51f8a-5753-66a8-9b96-ecd4d6a6f45c"), "Sport", 6.5m, "Basketball", null, null },
                    { new Guid("ab368f87-263f-05e9-3e82-09fad12f18ee"), "Sport", 7.0m, "Soccer", null, null },
                    { new Guid("c173cecb-b2a6-5cad-85f7-16e8bb77cc03"), "Sport", 7.3m, "Tennis", null, null },
                    { new Guid("d5d31501-4fad-9d1d-27ea-0644d9ee0d3d"), "Strength", 3.5m, "Lateral Raise", "Shoulders", null },
                    { new Guid("e2bd6711-7871-bb92-86d7-18a106c60500"), "Strength", 5.0m, "Chin-up", "Back", null },
                    { new Guid("e420f627-8003-5470-00cb-d8f33e201952"), "Strength", 5.0m, "Romanian Deadlift", "Hamstrings", null },
                    { new Guid("ee1f05c9-bdf3-da67-3521-50474f0a7070"), "Strength", 5.0m, "Dip", "Triceps", null },
                    { new Guid("f5a3b116-d5f3-8e0c-7aed-9184de22048b"), "Strength", 5.0m, "Bench Press", "Chest", null },
                    { new Guid("f87a1212-88e2-71ac-cce1-c3f2bebf0702"), "Cardio", 7.0m, "Rowing Machine", null, null },
                    { new Guid("fecad676-3c6b-f424-f98f-c7c054c762a6"), "Strength", 5.0m, "Pull-up", "Back", null }
                });

            migrationBuilder.CreateIndex(
                name: "IX_AspNetRoleClaims_RoleId",
                table: "AspNetRoleClaims",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "RoleNameIndex",
                table: "AspNetRoles",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserClaims_UserId",
                table: "AspNetUserClaims",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserLogins_UserId",
                table: "AspNetUserLogins",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserRoles_RoleId",
                table: "AspNetUserRoles",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "EmailIndex",
                table: "AspNetUsers",
                column: "NormalizedEmail");

            migrationBuilder.CreateIndex(
                name: "UserNameIndex",
                table: "AspNetUsers",
                column: "NormalizedUserName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Exercises_UserId_Name",
                table: "Exercises",
                columns: new[] { "UserId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_Measurements_UserId_Date",
                table: "Measurements",
                columns: new[] { "UserId", "Date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Templates_UserId",
                table: "Templates",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Weights_UserId_Date",
                table: "Weights",
                columns: new[] { "UserId", "Date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutExercise_ExerciseId",
                table: "WorkoutExercise",
                column: "ExerciseId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutExercise_WorkoutId",
                table: "WorkoutExercise",
                column: "WorkoutId");

            migrationBuilder.CreateIndex(
                name: "IX_Workouts_UserId_Date",
                table: "Workouts",
                columns: new[] { "UserId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutSet_WorkoutExerciseId",
                table: "WorkoutSet",
                column: "WorkoutExerciseId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AspNetRoleClaims");

            migrationBuilder.DropTable(
                name: "AspNetUserClaims");

            migrationBuilder.DropTable(
                name: "AspNetUserLogins");

            migrationBuilder.DropTable(
                name: "AspNetUserRoles");

            migrationBuilder.DropTable(
                name: "AspNetUserTokens");

            migrationBuilder.DropTable(
                name: "DailyLogs");

            migrationBuilder.DropTable(
                name: "DataProtectionKeys");

            migrationBuilder.DropTable(
                name: "Measurements");

            migrationBuilder.DropTable(
                name: "Templates");

            migrationBuilder.DropTable(
                name: "Weights");

            migrationBuilder.DropTable(
                name: "WorkoutSet");

            migrationBuilder.DropTable(
                name: "AspNetRoles");

            migrationBuilder.DropTable(
                name: "WorkoutExercise");

            migrationBuilder.DropTable(
                name: "Exercises");

            migrationBuilder.DropTable(
                name: "Workouts");

            migrationBuilder.DropTable(
                name: "AspNetUsers");
        }
    }
}
