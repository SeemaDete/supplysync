-- SupplySync reporting layer for Power BI / Excel / any SQL client.
-- Run after the first migration:   npm run db:views
-- Re-runnable (CREATE OR REPLACE). Connect Power BI to Supabase Postgres and import the rpt_* views.

CREATE SCHEMA IF NOT EXISTS reporting;

-- One row per PO line with every tracker field, effective dates and derived flags
CREATE OR REPLACE VIEW reporting.rpt_po_lines AS
SELECT
  po.po_number,
  l.line_number                                   AS po_line,
  s.code                                          AS supplier_code,
  s.name                                          AS supplier_name,
  s.email                                         AS supplier_email,
  s.contact_person                                AS supplier_contact,
  l.material_number,
  l.material_description,
  l.plant,
  l.storage_location,
  l.ordered_qty,
  l.delivered_qty,
  l.received_qty,
  l.outstanding_qty,
  GREATEST(l.ordered_qty - l.delivered_qty, 0)    AS outstanding_delivery_qty,
  GREATEST(l.delivered_qty - l.received_qty, 0)   AS pending_gr_qty,
  l.uom,
  l.unit_price,
  l.ordered_qty * l.unit_price                    AS line_value,
  po.currency,
  po.po_creation_date,
  po.po_sent_date,
  po.supplier_receipt_status,
  po.supplier_receipt_date,
  l.confirmation_status,
  l.original_requested_date,
  l.supplier_confirmed_date,
  l.latest_revised_date,
  COALESCE(l.latest_revised_date, l.supplier_confirmed_date, l.original_requested_date) AS effective_delivery_date,
  l.followup_date,
  l.last_followup_date,
  l.next_followup_date,
  l.actual_delivery_date,
  l.last_gr_number                                AS gr_number,
  l.last_gr_date                                  AS gr_date,
  b.name                                          AS buyer_name,
  b.email                                         AS buyer_email,
  COALESCE(l.status_override, l.status)           AS status,
  po.status                                       AS po_status,
  l.remarks,
  (CURRENT_DATE - po.po_creation_date)            AS age_days,
  CASE WHEN l.outstanding_qty > 0
        AND COALESCE(l.latest_revised_date, l.supplier_confirmed_date, l.original_requested_date) < CURRENT_DATE
       THEN true ELSE false END                   AS is_overdue,
  CASE WHEN l.actual_delivery_date IS NOT NULL
        AND l.actual_delivery_date <= COALESCE(l.supplier_confirmed_date, l.original_requested_date)
       THEN true ELSE false END                   AS delivered_on_time
FROM purchase_order_lines l
JOIN purchase_orders po ON po.id = l.purchase_order_id
JOIN suppliers s        ON s.id = po.supplier_id
JOIN users b            ON b.id = po.buyer_id
WHERE po.archived_at IS NULL;

-- Supplier scorecard
CREATE OR REPLACE VIEW reporting.rpt_supplier_performance AS
SELECT
  supplier_code,
  supplier_name,
  COUNT(*)                                                         AS total_lines,
  COUNT(*) FILTER (WHERE outstanding_qty > 0)                      AS open_lines,
  COUNT(*) FILTER (WHERE is_overdue)                               AS overdue_lines,
  COUNT(*) FILTER (WHERE actual_delivery_date IS NOT NULL)         AS delivered_lines,
  ROUND(100.0 * COUNT(*) FILTER (WHERE delivered_on_time)
        / NULLIF(COUNT(*) FILTER (WHERE actual_delivery_date IS NOT NULL), 0), 1) AS on_time_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE confirmation_status IN ('CONFIRMED','REVISED'))
        / NULLIF(COUNT(*), 0), 1)                                  AS confirmation_pct,
  SUM(line_value)                                                  AS total_value
FROM reporting.rpt_po_lines
GROUP BY supplier_code, supplier_name;

-- Follow-up history
CREATE OR REPLACE VIEW reporting.rpt_followups AS
SELECT
  po.po_number,
  l.line_number AS po_line,
  f.target_date,
  f.due_date,
  f.source,
  f.status,
  f.notified_at,
  f.completed_at,
  u.name AS assigned_to,
  CASE WHEN f.status = 'DONE' AND f.completed_at::date <= f.due_date THEN true ELSE false END AS done_on_time
FROM followups f
JOIN purchase_order_lines l ON l.id = f.line_id
JOIN purchase_orders po     ON po.id = l.purchase_order_id
LEFT JOIN users u           ON u.id = f.assigned_to_id;

-- Monthly delivery trend
CREATE OR REPLACE VIEW reporting.rpt_monthly_deliveries AS
SELECT
  date_trunc('month', d.delivery_date)::date AS month,
  COUNT(*)                                    AS deliveries,
  SUM(d.quantity)                             AS quantity
FROM delivery_records d
GROUP BY 1
ORDER BY 1;

-- Read-only role for BI tools (set a password, then use it in Power BI)
-- CREATE ROLE powerbi_reader LOGIN PASSWORD 'change-me';
-- GRANT USAGE ON SCHEMA reporting TO powerbi_reader;
-- GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO powerbi_reader;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO powerbi_reader;  -- views read base tables
