// Mirrors docs/api.md and docs/workout-flow.md. All numeric body values are metric.
export type Sex = "Male" | "Female";
export type ActivityLevel = "Sedentary" | "Light" | "Moderate" | "VeryActive" | "ExtraActive";
export type UnitSystem = "Metric" | "Imperial";
export type GoalMode = "Lose" | "Maintain" | "Gain";
export type ExerciseCategory = "Strength" | "Cardio" | "Mobility" | "Sport";
export type WorkoutType = "Strength" | "Cardio" | "Mobility" | "Other";
export type TemplateKind = "Workout" | "RestDay";
export type GroupType = "Superset" | "Circuit";
export type PlanStatus = "Planned" | "Completed" | "Skipped";
export type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export interface Me {
  id: string;
  email: string;
  displayName: string;
  profileComplete: boolean;
  unitSystem: UnitSystem;
}

export interface Profile {
  displayName: string;
  email: string;
  dateOfBirth: string | null;
  age: number | null;
  sex: Sex | null;
  heightCm: number | null;
  activityLevel: ActivityLevel;
  unitSystem: UnitSystem;
  timeZone: string;
  /** Use logged workout calories instead of the activity multiplier for TDEE. */
  useLoggedActivity: boolean;
}
export type UpdateProfile = Omit<Profile, "email" | "age">;

export interface Goal {
  mode: GoalMode;
  targetWeightKg: number | null;
  targetDate: string | null;
  weeklyRateKg: number;
  weeklyWorkoutTarget: number;
}

export interface WeightInput {
  date: string;
  weightKg: number;
  bodyFatPercent: number | null;
  note: string | null;
}
export interface WeightEntry extends WeightInput {
  id: string;
  leanMassKg: number | null;
  bmi: number | null;
}

export const measurementKeys = ["waistCm", "chestCm", "hipsCm", "armCm", "thighCm", "neckCm", "shouldersCm"] as const;
export type MeasurementKey = (typeof measurementKeys)[number];
export type MeasurementInput = { date: string; note: string | null } & Record<MeasurementKey, number | null>;
export type Measurement = MeasurementInput & { id: string };

export interface DailyInput {
  steps: number | null;
  sleepHours: number | null;
  restingHeartRate: number | null;
  energy: number | null;
  soreness: number | null;
  mood: number | null;
  note: string | null;
}
export type DailyLog = DailyInput & { date: string };

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  primaryMuscle: string | null;
  met: number | null;
  isCustom: boolean;
}

export interface SetInput {
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  rir: number | null;
  restSeconds: number | null;
  tempo: string | null;
  durationSeconds: number | null;
  distanceM: number | null;
  avgHeartRate: number | null;
  isWarmup: boolean;
}
export interface WorkoutExerciseInput {
  exerciseId: string;
  supersetGroup: number | null;
  notes: string | null;
  sets: SetInput[];
}
export interface WorkoutInput {
  date: string;
  name: string;
  durationMinutes: number | null;
  notes: string | null;
  exercises: WorkoutExerciseInput[];
  /** "HH:mm" local start time (manual log). */
  startTime?: string | null;
  /** Derived from the exercises when null. */
  type?: WorkoutType | null;
  templateId?: string | null;
  /** Marks that plan entry Completed. */
  planEntryId?: string | null;
}
export interface Workout extends Omit<WorkoutInput, "exercises" | "startTime" | "type" | "templateId" | "planEntryId"> {
  id: string;
  startTime: string | null;
  type: WorkoutType;
  templateId: string | null;
  planEntryId: string | null;
  totalVolumeKg: number;
  estimatedCalories: number | null;
  exercises: (WorkoutExerciseInput & {
    exerciseName: string;
    category: ExerciseCategory;
    sets: (SetInput & { estimated1Rm: number | null; paceSecPerKm: number | null })[];
  })[];
}
export interface WorkoutSummary {
  id: string;
  date: string;
  name: string;
  durationMinutes: number | null;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
  estimatedCalories: number | null;
  startTime: string | null;
  type: WorkoutType;
  templateId: string | null;
  planEntryId: string | null;
}

export interface TemplateItemInput {
  exerciseId: string;
  sets: number;
  reps: number | null;
  targetWeightKg: number | null;
  targetPercent1Rm: number | null;
  restSeconds: number | null;
  tempo: string | null;
  rpe: number | null;
  rir: number | null;
  notes: string | null;
  /** Same number = one superset/circuit block. */
  group: number | null;
  groupType: GroupType | null;
}
export interface TemplateInput {
  name: string;
  description: string | null;
  kind: TemplateKind;
  exercises: TemplateItemInput[];
}
export interface Template extends Omit<TemplateInput, "exercises"> {
  id: string;
  exercises: (TemplateItemInput & { exerciseName: string; category: ExerciseCategory })[];
}

export interface PlanEntry {
  id: string;
  date: string;
  templateId: string | null;
  templateName: string | null;
  kind: TemplateKind | null;
  status: PlanStatus;
  workoutId: string | null;
  seriesId: string | null;
  note: string | null;
}
export interface PlanEntryInput {
  templateId: string;
  date: string;
  note: string | null;
}
export interface RecurringPlanInput {
  templateId: string;
  startDate: string;
  weekdays: DayOfWeek[];
  weeks: number;
  note: string | null;
}
export interface PlanEntryUpdate {
  date: string;
  templateId: string;
  note: string | null;
  status: "Planned" | "Skipped";
}

export interface SessionSet {
  id: string;
  targetReps: number | null;
  targetWeightKg: number | null;
  targetRpe: number | null;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  rir: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  isWarmup: boolean;
  done: boolean;
}
export interface SessionExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  category: ExerciseCategory;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
  group: number | null;
  groupType: GroupType | null;
  skipped: boolean;
  sets: SessionSet[];
}
export interface Session {
  id: string;
  name: string;
  startedAt: string;
  templateId: string | null;
  planEntryId: string | null;
  notes: string | null;
  exercises: SessionExercise[];
  updatedAt: string;
}
export interface SessionInput {
  name: string;
  notes: string | null;
  exercises: SessionExercise[];
}
export interface StartSessionInput {
  planEntryId: string | null;
  templateId: string | null;
  name: string | null;
}
export interface LogSetInput {
  exerciseId: string;
  setId: string;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  rir: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  done: boolean;
}
export interface FinishSessionInput {
  notes: string | null;
  durationMinutes: number | null;
}
export interface SessionSummary {
  workout: Workout;
  durationMinutes: number;
  setsDone: number;
  totalVolumeKg: number;
  estimatedCalories: number | null;
  prs: { exerciseId: string; exerciseName: string; kind: "Weight" | "E1rm"; value: number; previous: number | null }[];
  weekStreak: number;
  workoutsThisWeek: number;
  weeklyTarget: number;
  nextPlan: PlanEntry | null;
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  bestWeightKg: number | null;
  /** Reps of the heaviest set (e.g. 100 kg × 3). */
  bestWeightReps: number | null;
  bestWeightDate: string | null;
  best1Rm: number | null;
  best1RmDate: string | null;
}

export interface CalorieInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  bodyFatPercent: number | null;
  activityLevel: ActivityLevel;
  mode: GoalMode;
  weeklyRateKg: number;
  targetWeightKg: number | null;
  /** When set, TDEE = BMR × 1.2 + this (logged training) instead of the activity multiplier. */
  exerciseKcalPerDay?: number | null;
}
export interface CalorieResult {
  formula: "MifflinStJeor" | "KatchMcArdle";
  bmr: number;
  tdee: number;
  targetCalories: number;
  dailyAdjustment: number;
  weeklyRateKg: number;
  projectedWeeks: number | null;
  projectedDate: string | null;
  macros: { proteinG: number; fatG: number; carbsG: number };
  warnings: string[];
  activitySource: "ActivityLevel" | "LoggedWorkouts";
  exerciseKcalPerDay: number | null;
}

export interface Dashboard {
  weight: {
    latestKg: number | null;
    latestDate: string | null;
    change30dKg: number | null;
    avg7dKg: number | null;
    bmi: number | null;
    bodyFatPercent: number | null;
    series: { date: string; weightKg: number; trendKg: number }[];
  };
  goal: {
    mode: GoalMode;
    targetWeightKg: number | null;
    startWeightKg: number | null;
    progressPercent: number | null;
    projectedDate: string | null;
    targetDate: string | null;
    /** false when the target date is earlier than the projected date at the current weekly rate. */
    targetDateFeasible: boolean | null;
    /** Weekly rate needed to hit the target date (kg/week), when a target date is set. */
    requiredWeeklyRateKg: number | null;
  };
  training: {
    workoutsThisWeek: number;
    weeklyTarget: number;
    weekStreak: number;
    totalWorkouts: number;
    weeks: { weekStart: string; workouts: number; volumeKg: number }[];
    avgExerciseKcalPerDay: number;
    plannedThisWeek: number;
    completedPlannedThisWeek: number;
  };
  nextPlan: PlanEntry | null;
  recentRecords: { exerciseId: string; exerciseName: string; weightKg: number; reps: number | null; estimated1Rm: number | null; date: string }[];
  calories: CalorieResult | null;
}

export const activityLabels: Record<ActivityLevel, string> = {
  Sedentary: "Sedentary — desk job, little exercise",
  Light: "Light — exercise 1–3 days a week",
  Moderate: "Moderate — exercise 3–5 days a week",
  VeryActive: "Very active — hard exercise 6–7 days a week",
  ExtraActive: "Extra active — physical job plus training",
};
