export type DailyLogWeather = "sunny" | "cloudy" | "rain" | "heat_wind"

export type SaveDailyLogResult =
  | { ok: true }
  | { ok: false; error: string }
