// Notion data sources and habit rules. IDs are not secret: without the token they give no access.

export const DS = {
  habits: "570088a8-9485-8301-ae74-8774e813cbe3",
  goals: "957d41f2-d432-4257-b9ae-70647426a4b4",
  top3: "0d2a2428-3770-47bf-b98d-158d82fd6a3d",
  calendar: "2ac088a8-9485-8197-b198-000bd41fc6d0",
  assignments: "3e4088a8-9485-83a9-a3ef-07ac05919cca",
  vision: "c78b26d1-8a4e-43f0-b64f-4f475c474a4f",
  learning: "d2ed32fb-c9f1-4550-b91d-44e44868ff44",
} as const;

/** Life areas, as named in the Goals and Vision Board "Area" property. */
export const AREAS = ["Health & Gym", "Career & Code", "Money & Home", "Apolo", "Travel", "Personal Growth"] as const;

/** How many photos the Vision collage shows at once. */
export const COLLAGE_SIZE = 8;

/** Page "school" that holds the "schedule" table. */
export const SCHOOL_PAGE = "4e2088a8-9485-8281-b8e1-81eb5745624a";

export interface HabitDef {
  /** Exact checkbox property name in the Habit Tracker. */
  prop: string;
  /** Name shown in the app. */
  label: string;
  /** Days per week (Mon–Sun). */
  target: number;
}

export const HABITS: HabitDef[] = [
  { prop: "AM skincare", label: "AM skincare", target: 7 },
  { prop: "Creatine", label: "Creatine", target: 7 },
  { prop: "Gym", label: "Gym", target: 4 },
  { prop: "Apolo walk", label: "Apolo walk", target: 5 },
  { prop: "Code", label: "Code", target: 5 },
  { prop: "healthy meal", label: "Healthy meal", target: 7 },
  { prop: "Posture", label: "Posture", target: 5 },
  { prop: "Night shower + read", label: "Shower + read", target: 5 },
  { prop: "PM Skincare", label: "PM skincare", target: 7 },
];

/** How many days of history are read to compute streaks. */
export const HISTORY_DAYS = 400;
