-- Add source column to Feedback table to track where feedback came from
-- This helps distinguish between demo limit feedback, general feedback, etc.

-- Add source column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'feedback' AND column_name = 'source'
  ) THEN
    ALTER TABLE Feedback 
    ADD COLUMN source VARCHAR(50) DEFAULT 'general';
    
    COMMENT ON COLUMN Feedback.source IS 'Source of feedback: demo_limit, general, feature_page, etc.';
    
    PRINT '✅ Added source column to Feedback table';
  ELSE
    PRINT 'ℹ️ Source column already exists in Feedback table';
  END IF;
END $$;

-- Create index on source column for faster queries
CREATE INDEX IF NOT EXISTS idx_feedback_source ON Feedback(source);

-- Update feedback_type enum if needed to include demo_feedback
DO $$
BEGIN
  -- Check if we need to update the feedback_type enum
  -- This is a PostgreSQL-specific way to add values to an enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'demo_feedback' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'feedback_type')
  ) THEN
    -- If feedback_type is not an enum but a varchar, this will be skipped
    -- If it is an enum, add the new value
    BEGIN
      ALTER TYPE feedback_type ADD VALUE 'demo_feedback';
      PRINT '✅ Added demo_feedback to feedback_type enum';
    EXCEPTION WHEN OTHERS THEN
      PRINT 'ℹ️ feedback_type is not an enum or demo_feedback already exists';
    END;
  END IF;
END $$;

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'feedback' 
AND column_name IN ('source', 'feedback_type', 'message', 'user_email');

PRINT '✅ Feedback table migration completed successfully!';
