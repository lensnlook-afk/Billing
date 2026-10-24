-- Add payment_method column to invoices for reporting
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method text;
