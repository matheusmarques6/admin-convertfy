-- Add line_items and shipping_address to tracking_orders for rich widget display
ALTER TABLE tracking_orders
  ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tracking_orders.line_items IS 'Array of {title, quantity, price, image_url, product_id, variant_id, sku}';
COMMENT ON COLUMN tracking_orders.shipping_address IS '{city, province, country, zip, address1, first_name, last_name}';
