-- Add media_type to field_report_photos to support videos alongside photos
ALTER TABLE field_report_photos
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL DEFAULT 'photo';
