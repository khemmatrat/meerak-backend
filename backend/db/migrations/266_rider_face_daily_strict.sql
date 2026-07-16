-- Expand face session purposes: daily clock-in + strict periodic verify
ALTER TABLE commerce.rider_face_sessions
  DROP CONSTRAINT IF EXISTS rider_face_sessions_purpose_check;

ALTER TABLE commerce.rider_face_sessions
  ADD CONSTRAINT rider_face_sessions_purpose_check
  CHECK (purpose IN ('online', 'passenger', 'reverify', 'daily', 'strict'));
