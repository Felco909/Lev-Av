-- CreateTable
CREATE TABLE "carriers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "inn" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address" TEXT,
    "bank_details" TEXT,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "inn" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "act_template_name" TEXT,
    "act_template_path" TEXT,
    "invoice_template_name" TEXT,
    "invoice_template_path" TEXT,
    "act_prefix" TEXT NOT NULL DEFAULT 'АКТ',
    "invoice_prefix" TEXT NOT NULL DEFAULT 'СЧ',
    "last_act_num" INTEGER NOT NULL DEFAULT 0,
    "last_invoice_num" INTEGER NOT NULL DEFAULT 0,
    "last_reset_year" INTEGER,
    "number_format" TEXT NOT NULL DEFAULT '{prefix}-{number}',
    "reset_numbering_yearly" BOOLEAN NOT NULL DEFAULT false,
    "payment_terms_days" INTEGER,
    "contract_file" TEXT,
    "contract_file_name" TEXT,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_expiries" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_name" TEXT NOT NULL,
    "expiry_date" DATE NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_expiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "cloud_storage_path" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_vehicle_history" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "old_driver_id" TEXT,
    "old_driver_name" TEXT,
    "new_driver_id" TEXT,
    "new_driver_name" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_vehicle_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "license_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "expense_type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount_amd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AMD',
    "exchange_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_expenses" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "expense_type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AMD',
    "exchange_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "amount_amd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicle_trip_id" TEXT,
    "liters" DECIMAL(10,2),

    CONSTRAINT "fleet_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_records" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "liters" DECIMAL(10,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mileage" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenances" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "next_date" DATE,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mileage" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_attachments" (
    "id" TEXT NOT NULL,
    "part_purchase_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "cloud_storage_path" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_payments" (
    "id" TEXT NOT NULL,
    "part_purchase_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_purchases" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "date" DATE NOT NULL,
    "part_name" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "amount_amd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AMD',
    "payment_date" DATE NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'bank_transfer',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exchange_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL DEFAULT 'client',

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_templates" (
    "id" TEXT NOT NULL,
    "route_from" TEXT NOT NULL,
    "route_to" TEXT NOT NULL,
    "distance" INTEGER,
    "default_rate" DECIMAL(12,2),
    "vehicle_type" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL DEFAULT 'AMD',

    CONSTRAINT "route_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_records" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "regulation_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mileage" INTEGER NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_regulations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mileage_interval" INTEGER,
    "months_interval" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_regulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "payment_terms" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_sets" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "brand" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "position" TEXT,
    "install_date" DATE,
    "install_mileage" INTEGER,
    "remove_date" DATE,
    "remove_mileage" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'installed',
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_attachments" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "cloud_storage_path" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_history" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "trip_number" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "route_from" TEXT NOT NULL,
    "route_to" TEXT NOT NULL,
    "trip_type" TEXT NOT NULL,
    "client_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vehicle_id" TEXT,
    "driver_id" TEXT,
    "carrier_id" TEXT,
    "carrier_rate" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'new',
    "trip_date" DATE NOT NULL,
    "profit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cargo_weight" DECIMAL(10,2),
    "distance" INTEGER,
    "carrier_rate_amd" DECIMAL(14,2),
    "client_rate_amd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AMD',
    "exchange_diff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "exchange_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "original_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "profit_amd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_due_date" DATE,
    "carrier_currency" TEXT,
    "carrier_exchange_rate" DECIMAL(12,4),
    "contract_number" TEXT,
    "request_number" TEXT,
    "basis_text" TEXT,
    "contract_date" TEXT,
    "contact_id" TEXT,
    "carrier_paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "carrier_paid_amount_amd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "carrier_payment_date" DATE,
    "carrier_payment_note" TEXT,
    "carrier_payment_status" TEXT NOT NULL DEFAULT 'not_paid',
    "client_paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "client_paid_amount_amd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "client_payment_status" TEXT NOT NULL DEFAULT 'not_paid',
    "invoice_series" TEXT,
    "carrier_invoice_series" TEXT,
    "client_invoice_series" TEXT,
    "notes" TEXT,
    "vehicle_trip_id" TEXT,
    "unload_date" DATE,
    "act_doc_date" DATE,
    "act_doc_number" TEXT,
    "invoice_doc_date" DATE,
    "invoice_doc_number" TEXT,
    "tax_code" TEXT,
    "doc_transport_text" TEXT,
    "carrier_expenses" JSONB,
    "client_expenses" JSONB,
    "additional_terms" TEXT,
    "cargo_name" TEXT,
    "cargo_value" DECIMAL(14,2),
    "customs_departure" TEXT,
    "customs_destination" TEXT,
    "loading_address" TEXT,
    "trailer_plate" TEXT,
    "truck_type" TEXT,
    "unloading_address" TEXT,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'dispatcher',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_trips" (
    "id" TEXT NOT NULL,
    "trip_number" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "departure_date" DATE NOT NULL,
    "start_mileage" INTEGER,
    "start_fuel" DECIMAL(8,2),
    "return_date" DATE,
    "end_mileage" INTEGER,
    "end_fuel" DECIMAL(8,2),
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "other_expenses" DECIMAL(12,2),
    "other_expenses_amd" DECIMAL(14,2),
    "per_diem" DECIMAL(12,2),
    "per_diem_amd" DECIMAL(14,2),
    "salary" DECIMAL(12,2),
    "salary_amd" DECIMAL(14,2),
    "other_currency" TEXT NOT NULL DEFAULT 'AMD',
    "other_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "per_diem_currency" TEXT NOT NULL DEFAULT 'AMD',
    "per_diem_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "salary_currency" TEXT NOT NULL DEFAULT 'AMD',
    "salary_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "fuel_cost" DECIMAL(12,2),
    "fuel_cost_amd" DECIMAL(14,2),
    "fuel_currency" TEXT NOT NULL DEFAULT 'AMD',
    "fuel_liters" DECIMAL(10,2),
    "fuel_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "per_diem_2" DECIMAL(12,2),
    "per_diem_2_amd" DECIMAL(14,2),
    "per_diem_2_currency" TEXT NOT NULL DEFAULT 'AMD',
    "per_diem_2_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "per_diem_3" DECIMAL(12,2),
    "per_diem_3_amd" DECIMAL(14,2),
    "per_diem_3_currency" TEXT NOT NULL DEFAULT 'AMD',
    "per_diem_3_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,

    CONSTRAINT "vehicle_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_mileage" INTEGER,
    "driver_id" TEXT,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_contacts_client_id_idx" ON "client_contacts"("client_id" ASC);

-- CreateIndex
CREATE INDEX "document_expiries_entity_type_entity_id_idx" ON "document_expiries"("entity_type" ASC, "entity_id" ASC);

-- CreateIndex
CREATE INDEX "document_expiries_expiry_date_idx" ON "document_expiries"("expiry_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_document_type_key" ON "document_templates"("document_type" ASC);

-- CreateIndex
CREATE INDEX "driver_vehicle_history_vehicle_id_idx" ON "driver_vehicle_history"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "expenses_trip_id_idx" ON "expenses"("trip_id" ASC);

-- CreateIndex
CREATE INDEX "fleet_expenses_date_idx" ON "fleet_expenses"("date" ASC);

-- CreateIndex
CREATE INDEX "fleet_expenses_expense_type_idx" ON "fleet_expenses"("expense_type" ASC);

-- CreateIndex
CREATE INDEX "fleet_expenses_vehicle_id_idx" ON "fleet_expenses"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "fleet_expenses_vehicle_trip_id_idx" ON "fleet_expenses"("vehicle_trip_id" ASC);

-- CreateIndex
CREATE INDEX "fuel_records_date_idx" ON "fuel_records"("date" ASC);

-- CreateIndex
CREATE INDEX "fuel_records_vehicle_id_idx" ON "fuel_records"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "maintenances_next_date_idx" ON "maintenances"("next_date" ASC);

-- CreateIndex
CREATE INDEX "maintenances_vehicle_id_idx" ON "maintenances"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "part_attachments_part_purchase_id_idx" ON "part_attachments"("part_purchase_id" ASC);

-- CreateIndex
CREATE INDEX "part_payments_part_purchase_id_idx" ON "part_payments"("part_purchase_id" ASC);

-- CreateIndex
CREATE INDEX "part_purchases_date_idx" ON "part_purchases"("date" ASC);

-- CreateIndex
CREATE INDEX "part_purchases_payment_status_idx" ON "part_purchases"("payment_status" ASC);

-- CreateIndex
CREATE INDEX "part_purchases_supplier_id_idx" ON "part_purchases"("supplier_id" ASC);

-- CreateIndex
CREATE INDEX "part_purchases_vehicle_id_idx" ON "part_purchases"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "payments_trip_id_idx" ON "payments"("trip_id" ASC);

-- CreateIndex
CREATE INDEX "payments_trip_id_type_idx" ON "payments"("trip_id" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "service_records_regulation_id_idx" ON "service_records"("regulation_id" ASC);

-- CreateIndex
CREATE INDEX "service_records_vehicle_id_idx" ON "service_records"("vehicle_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key" ASC);

-- CreateIndex
CREATE INDEX "tire_sets_vehicle_id_idx" ON "tire_sets"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "trip_attachments_trip_id_idx" ON "trip_attachments"("trip_id" ASC);

-- CreateIndex
CREATE INDEX "trip_history_created_at_idx" ON "trip_history"("created_at" ASC);

-- CreateIndex
CREATE INDEX "trip_history_trip_id_idx" ON "trip_history"("trip_id" ASC);

-- CreateIndex
CREATE INDEX "trips_contact_id_idx" ON "trips"("contact_id" ASC);

-- CreateIndex
CREATE INDEX "trips_currency_idx" ON "trips"("currency" ASC);

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status" ASC);

-- CreateIndex
CREATE INDEX "trips_trip_date_idx" ON "trips"("trip_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "trips_trip_number_key" ON "trips"("trip_number" ASC);

-- CreateIndex
CREATE INDEX "trips_trip_type_idx" ON "trips"("trip_type" ASC);

-- CreateIndex
CREATE INDEX "trips_vehicle_trip_id_idx" ON "trips"("vehicle_trip_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email" ASC);

-- CreateIndex
CREATE INDEX "vehicle_trips_departure_date_idx" ON "vehicle_trips"("departure_date" ASC);

-- CreateIndex
CREATE INDEX "vehicle_trips_driver_id_idx" ON "vehicle_trips"("driver_id" ASC);

-- CreateIndex
CREATE INDEX "vehicle_trips_status_idx" ON "vehicle_trips"("status" ASC);

-- CreateIndex
CREATE INDEX "vehicle_trips_vehicle_id_idx" ON "vehicle_trips"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "vehicles_driver_id_idx" ON "vehicles"("driver_id" ASC);

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_history" ADD CONSTRAINT "driver_vehicle_history_new_driver_id_fkey" FOREIGN KEY ("new_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_history" ADD CONSTRAINT "driver_vehicle_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_expenses" ADD CONSTRAINT "fleet_expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_expenses" ADD CONSTRAINT "fleet_expenses_vehicle_trip_id_fkey" FOREIGN KEY ("vehicle_trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_records" ADD CONSTRAINT "fuel_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenances" ADD CONSTRAINT "maintenances_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_attachments" ADD CONSTRAINT "part_attachments_part_purchase_id_fkey" FOREIGN KEY ("part_purchase_id") REFERENCES "part_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_payments" ADD CONSTRAINT "part_payments_part_purchase_id_fkey" FOREIGN KEY ("part_purchase_id") REFERENCES "part_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_purchases" ADD CONSTRAINT "part_purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_purchases" ADD CONSTRAINT "part_purchases_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_regulation_id_fkey" FOREIGN KEY ("regulation_id") REFERENCES "service_regulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_attachments" ADD CONSTRAINT "trip_attachments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_history" ADD CONSTRAINT "trip_history_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_trip_id_fkey" FOREIGN KEY ("vehicle_trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_trips" ADD CONSTRAINT "vehicle_trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_trips" ADD CONSTRAINT "vehicle_trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

