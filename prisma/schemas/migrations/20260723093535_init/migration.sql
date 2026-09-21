-- CreateEnum
CREATE TYPE "media_entity_type" AS ENUM ('USER_AVATAR');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('CUSTOMER', 'SHOP_OWNER', 'ADMIN');

-- CreateTable
CREATE TABLE "Media" (
    "id" UUID NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(1000) NOT NULL,
    "public_url" TEXT NOT NULL,
    "file_name" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "entity_type" "media_entity_type" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "avatar" TEXT,
    "avatar_public_id" VARCHAR(1000),
    "password" VARCHAR(255) NOT NULL,
    "acc_verification_otp" VARCHAR(10),
    "acc_verified" BOOLEAN NOT NULL DEFAULT false,
    "role" "user_role" NOT NULL,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "reset_pass_otp" VARCHAR(255),
    "reset_pass_otp_expired_at" TIMESTAMPTZ,
    "pending_email" VARCHAR(255),
    "pending_email_otp" VARCHAR(10),
    "pending_email_otp_expired_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Media_user_id_idx" ON "Media"("user_id");

-- CreateIndex
CREATE INDEX "Media_entity_type_idx" ON "Media"("entity_type");

-- CreateIndex
CREATE INDEX "Media_bucket_storage_path_idx" ON "Media"("bucket", "storage_path");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_pending_email_key" ON "User"("pending_email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_is_suspended_idx" ON "User"("is_suspended");

-- CreateIndex
CREATE INDEX "User_created_at_idx" ON "User"("created_at" DESC);
