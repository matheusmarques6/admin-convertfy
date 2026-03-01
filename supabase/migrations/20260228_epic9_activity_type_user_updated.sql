-- Story 9.5 - Add user_updated to activity_type enum
-- Needed for profile and password change activity logging

ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'user_updated';
