-- CreateTable
CREATE TABLE "trip_document_issues" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "bank_details_snapshot" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_document_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_document_issues_trip_id_created_at_idx" ON "trip_document_issues"("trip_id", "created_at");
