import type { MaybePromise } from '@newfoundcodes/helvetium-boot';

export interface Notification {
  id?: string;
  topic?: string;
  subject?: string;
  text?: string;
  html?: string;
  data?: Record<string, unknown>;
  to?: string | string[];
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly name: string;
  send(notification: Notification): MaybePromise<void>;
}
