-- escola_turmas_professor_responsavel (ADR 0020)
-- Só acrescenta: nenhum dado existente muda. Empresas continuam CORPORATE e departamentos, DEPARTMENT.

-- CreateEnum
CREATE TYPE "TenantSegment" AS ENUM ('CORPORATE', 'SCHOOL', 'SCHOOL_NETWORK');

-- CreateEnum
CREATE TYPE "DepartmentKind" AS ENUM ('DEPARTMENT', 'GRADE', 'CLASS');

-- CreateEnum
CREATE TYPE "GuardianLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterEnum (valores novos não são usados nesta migração)
ALTER TYPE "TenantRole" ADD VALUE 'PROFESSOR';

-- AlterEnum
ALTER TYPE "OneTimeTokenPurpose" ADD VALUE 'SCHOOL_TRANSFER';
ALTER TYPE "OneTimeTokenPurpose" ADD VALUE 'GUARDIAN_LINK';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "network_id" UUID,
ADD COLUMN     "segment" "TenantSegment" NOT NULL DEFAULT 'CORPORATE';

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "grade" VARCHAR(3),
ADD COLUMN     "kind" "DepartmentKind" NOT NULL DEFAULT 'DEPARTMENT';

-- AlterTable
ALTER TABLE "planets" ADD COLUMN     "grade" VARCHAR(3);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "planet_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "user_id" UUID NOT NULL,
    "sender_id" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_links" (
    "id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "GuardianLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "consent_version" TEXT NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenants_network_id_idx" ON "tenants"("network_id");

-- CreateIndex
CREATE INDEX "departments_tenant_id_kind_grade_idx" ON "departments"("tenant_id", "kind", "grade");

-- CreateIndex
CREATE INDEX "planets_grade_idx" ON "planets"("grade");

-- CreateIndex
CREATE INDEX "teaching_assignments_tenant_id_idx" ON "teaching_assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_department_id_idx" ON "teaching_assignments"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_membership_id_department_id_planet_id_key" ON "teaching_assignments"("membership_id", "department_id", "planet_id");

-- CreateIndex
CREATE INDEX "notices_user_id_read_at_idx" ON "notices"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notices_tenant_id_idx" ON "notices"("tenant_id");

-- CreateIndex
CREATE INDEX "guardian_links_student_id_idx" ON "guardian_links"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_links_guardian_id_student_id_key" ON "guardian_links"("guardian_id", "student_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_planet_id_fkey" FOREIGN KEY ("planet_id") REFERENCES "planets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase (ADR 0016): toda tabela nova nasce com RLS ligado e sem políticas.
ALTER TABLE "teaching_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_links" ENABLE ROW LEVEL SECURITY;
