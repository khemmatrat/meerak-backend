export type TalentNotificationRow = {
  id?: string;
  title?: string;
  message?: string;
  sentAt?: string;
  created_at?: string;
  notificationType?: string;
  jobId?: string | null;
  data?: Record<string, unknown> | null;
  source?: string;
  /** From legacy payload — read-only display */
  is_read?: boolean;
  read?: boolean;
  read_at?: string | null;
};

export type TalentNotificationsLatestResponse = {
  notifications?: TalentNotificationRow[];
};
