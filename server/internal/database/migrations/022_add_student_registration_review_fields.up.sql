-- Add review fields for student self-registration workflow
ALTER TABLE users
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS approval_reason TEXT;

-- Normalize existing students to approved if empty
UPDATE users
SET approval_status = 'approved'
WHERE LOWER(role) = 'student'
  AND (approval_status IS NULL OR approval_status = '');

-- Helpful index for admin review page
CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);
