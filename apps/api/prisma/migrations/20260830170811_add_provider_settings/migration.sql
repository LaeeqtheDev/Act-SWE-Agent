-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL DEFAULT 'active',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiKeyEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);
