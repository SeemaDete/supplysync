-- Optional extra indexes beyond those declared in schema.prisma.
-- Run once with:  npx prisma db execute --file prisma/sql/performance_indexes.sql --schema prisma/schema.prisma

-- Fast text search on PO number / material / description (ILIKE '%term%')
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_po_number_trgm   ON purchase_orders      USING gin (po_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_material_trgm    ON purchase_order_lines USING gin (material_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_material_desc_trgm ON purchase_order_lines USING gin (material_description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_supplier_name_trgm ON suppliers          USING gin (name gin_trgm_ops);

-- Partial index: only open, non-archived POs are hot
CREATE INDEX IF NOT EXISTS idx_po_open ON purchase_orders (supplier_id, buyer_id)
  WHERE archived_at IS NULL AND status IN ('SENT','OPEN');

-- Follow-up engine scan: open follow-ups by due date
CREATE INDEX IF NOT EXISTS idx_followups_open_due ON followups (due_date) WHERE status = 'OPEN';

-- Lines with open quantity
CREATE INDEX IF NOT EXISTS idx_lines_outstanding ON purchase_order_lines (purchase_order_id)
  WHERE outstanding_qty > 0;
