-- Create ErrorQueries table
CREATE TABLE IF NOT EXISTS "ErrorQueries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "errorMessage" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "solution" TEXT,
  "errorCategory" VARCHAR(255) DEFAULT 'general',
  "aiProvider" VARCHAR(255) DEFAULT 'mock',
  "userSubscriptionTier" VARCHAR(255) NOT NULL DEFAULT 'free' CHECK ("userSubscriptionTier" IN ('free', 'pro', 'team')),
  "responseTime" INTEGER,
  "tags" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "error_queries_user_created_idx" ON "ErrorQueries" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "error_queries_category_idx" ON "ErrorQueries" ("errorCategory");

-- Add comment
COMMENT ON TABLE "ErrorQueries" IS 'Stores AI-generated error resolutions and analysis history';
