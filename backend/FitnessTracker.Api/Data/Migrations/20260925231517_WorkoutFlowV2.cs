using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FitnessTracker.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WorkoutFlowV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PlanEntryId",
                table: "Workouts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "StartTime",
                table: "Workouts",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TemplateId",
                table: "Workouts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "Workouts",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Other"); // DB default keeps an older image (which never sets Type) working

            // Existing history: majority exercise category (ties → earlier exercise), Sport → Other.
            migrationBuilder.Sql("""
                UPDATE "Workouts" w SET "Type" = COALESCE((
                    SELECT CASE e."Category" WHEN 'Sport' THEN 'Other' ELSE e."Category" END
                    FROM "WorkoutExercise" we JOIN "Exercises" e ON e."Id" = we."ExerciseId"
                    WHERE we."WorkoutId" = w."Id"
                    GROUP BY e."Category"
                    ORDER BY count(*) DESC, min(we."Position")
                    LIMIT 1), 'Other');
                """);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "Templates",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Workout");

            migrationBuilder.AddColumn<bool>(
                name: "UseLoggedActivity",
                table: "AspNetUsers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "PlanEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    WorkoutId = table.Column<Guid>(type: "uuid", nullable: true),
                    SeriesId = table.Column<Guid>(type: "uuid", nullable: true),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlanEntries_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PlanEntries_Templates_TemplateId",
                        column: x => x.TemplateId,
                        principalTable: "Templates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PlanEntries_Workouts_WorkoutId",
                        column: x => x.WorkoutId,
                        principalTable: "Workouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Sessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: true),
                    PlanEntryId = table.Column<Guid>(type: "uuid", nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ExercisesJson = table.Column<string>(type: "jsonb", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sessions_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Sessions_PlanEntries_PlanEntryId",
                        column: x => x.PlanEntryId,
                        principalTable: "PlanEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Sessions_Templates_TemplateId",
                        column: x => x.TemplateId,
                        principalTable: "Templates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Workouts_TemplateId",
                table: "Workouts",
                column: "TemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanEntries_SeriesId",
                table: "PlanEntries",
                column: "SeriesId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanEntries_TemplateId",
                table: "PlanEntries",
                column: "TemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanEntries_UserId_Date",
                table: "PlanEntries",
                columns: new[] { "UserId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_PlanEntries_WorkoutId",
                table: "PlanEntries",
                column: "WorkoutId");

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_PlanEntryId",
                table: "Sessions",
                column: "PlanEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_TemplateId",
                table: "Sessions",
                column: "TemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_UserId",
                table: "Sessions",
                column: "UserId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Workouts_Templates_TemplateId",
                table: "Workouts",
                column: "TemplateId",
                principalTable: "Templates",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Workouts_Templates_TemplateId",
                table: "Workouts");

            migrationBuilder.DropTable(
                name: "Sessions");

            migrationBuilder.DropTable(
                name: "PlanEntries");

            migrationBuilder.DropIndex(
                name: "IX_Workouts_TemplateId",
                table: "Workouts");

            migrationBuilder.DropColumn(
                name: "PlanEntryId",
                table: "Workouts");

            migrationBuilder.DropColumn(
                name: "StartTime",
                table: "Workouts");

            migrationBuilder.DropColumn(
                name: "TemplateId",
                table: "Workouts");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "Workouts");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Templates");

            migrationBuilder.DropColumn(
                name: "UseLoggedActivity",
                table: "AspNetUsers");
        }
    }
}
