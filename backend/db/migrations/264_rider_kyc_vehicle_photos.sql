-- Rider OS KYC — vehicles_json[] vehicle photo fields (stored in JSONB, no new columns)
-- Per vehicle object:
--   registration_book_photo_url
--   vehicle_photo_front_url, vehicle_photo_back_url
--   vehicle_photo_left_url, vehicle_photo_right_url
-- Optional public transport (kyc_submissions columns from 220):
--   wants_public_transport, yellow_plate_photo_url,
--   public_transport_license_front_url, public_transport_license_back_url

COMMENT ON COLUMN kyc_submissions.vehicles_json IS
  'Rider vehicles: plate, registration_book_photo_url, vehicle_photo_{front,back,left,right}_url, channel aqond_delivery';
