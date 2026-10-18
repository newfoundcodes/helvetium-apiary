export interface CronField {
  values: Set<number>;
  wildcard: boolean;
}

export interface CronPattern {
  seconds: CronField;
  minutes: CronField;
  hours: CronField;
  days: CronField;
  months: CronField;
  weekdays: CronField;
  hasSeconds: boolean;
}
