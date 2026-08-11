-- ============================================================================
-- Reset orders: wipe everything, reseed the 4 real orders from the buying
-- sheet (MCKTM 17406-007, 17406-150, 17410-150, 17405-007).
--
-- Supersedes 013_po_extra_percent_and_sizes.sql's seeding step -  run this one
-- regardless of whether 013 was applied; it's safe either way since step 1
-- deletes every order (and everything under it) before reseeding. Safe to
-- re-run: each run always ends with exactly these 4 orders, their 5 POs each,
-- and the size-wise buyer quantities below, at 2% extra.
--
-- WARNING: step 1 is destructive. It removes every order, PO, size row,
-- assignment, stage entry, production lot/txn, material requirement/entry,
-- and audit log row currently in the database -  there is no distinction made
-- between real and test data. Back up first if that matters to you.
-- ============================================================================

-- --- 1. Wipe every order and everything that cascades from it --------------
-- purchase_orders, po_size_quantities, user_assignments, stage_entries,
-- stage_sub_items, production_lots, material_requirements, material_entries,
-- production_txns, and audit_log all cascade automatically (see schema.sql
-- and migration 011) -  nothing else to delete by hand.

delete from public.orders;

-- --- 2. Make sure purchase_orders has extra_percent -------------------------

alter table public.purchase_orders
  add column if not exists extra_percent numeric not null default 0;

-- --- 3. The 4 orders + their 5 POs each -------------------------------------

with o1 as (
  insert into public.orders (io_no, style, description, color, fabric, total_qty, delivery_date)
  values ('90/26', 'MCKTM 17406-007', 'NACTON OPN HM PNT BLK-BL', 'BLACK',
          'Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM', 28943, '2026-09-14')
  returning id
), o2 as (
  insert into public.orders (io_no, style, description, color, fabric, total_qty, delivery_date)
  values ('90/26', 'MCKTM 17406-150', 'NACTON OPN HM PNT BLU-SW', 'STROMMY WEATHER',
          'Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM', 26266, '2026-09-14')
  returning id
), o3 as (
  insert into public.orders (io_no, style, description, color, fabric, total_qty, delivery_date)
  values ('89/26', 'MCKTM 17410-150', 'NACTON OH HD BLU-SWTH', 'STROMMY WEATHER',
          'Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM', 25441, '2026-09-14')
  returning id
), o4 as (
  insert into public.orders (io_no, style, description, color, fabric, total_qty, delivery_date)
  values ('88/26', 'MCKTM 17405-007', 'NACTON FZ HD BLK-BLK', 'BLACK',
          'Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM', 27606, '2026-09-14')
  returning id
), po_ins as (
  insert into public.purchase_orders (order_id, po_number, quantity, delivery_date, extra_percent)
  select id, po_number, quantity, delivery_date::date, 2 from (
    select (select id from o1) as id, '01669678' as po_number, 12359 as quantity, '2026-08-27' as delivery_date
    union all select (select id from o1), '01669676', 1339, '2026-08-27'
    union all select (select id from o1), '01669679', 8240, '2026-09-04'
    union all select (select id from o1), '01669680', 6181, '2026-09-14'
    union all select (select id from o1), '01669677', 824,  '2026-09-14'

    union all select (select id from o2), '01669688', 11845, '2026-08-27'
    union all select (select id from o2), '01669686', 1236,  '2026-08-27'
    union all select (select id from o2), '01669689', 7211,  '2026-09-04'
    union all select (select id from o2), '01669690', 5150,  '2026-09-14'
    union all select (select id from o2), '01669687', 824,   '2026-09-14'

    union all select (select id from o3), '01669693', 11330, '2026-08-27'
    union all select (select id from o3), '01669691', 1132,  '2026-08-27'
    union all select (select id from o3), '01669694', 7210,  '2026-09-04'
    union all select (select id from o3), '01669695', 4996,  '2026-09-14'
    union all select (select id from o3), '01669692', 773,   '2026-09-14'

    union all select (select id from o4), '01669683', 12361, '2026-08-27'
    union all select (select id from o4), '01669681', 1236,  '2026-08-27'
    union all select (select id from o4), '01669684', 8239,  '2026-09-04'
    union all select (select id from o4), '01669685', 5048,  '2026-09-14'
    union all select (select id from o4), '01669682', 722,   '2026-09-14'
  ) as po_rows
  returning id, po_number
)

-- --- 4. Size-wise buyer quantities (XS-2XL) for every PO above -------------

insert into public.po_size_quantities (po_id, size_code, sort_order, quantity)
select po.id, v.size_code, v.sort_order, v.quantity
from po_ins po
join (values
  -- MCKTM 17406-007 BLACK (IO 90/26)
  ('01669678','XS',0,1690),('01669678','S',1,3015),('01669678','M',2,4234),('01669678','L',3,2076),('01669678','XL',4,937),('01669678','2XL',5,407),
  ('01669676','XS',0,61),  ('01669676','S',1,181), ('01669676','M',2,474), ('01669676','L',3,346), ('01669676','XL',4,175),('01669676','2XL',5,102),
  ('01669679','XS',0,1127),('01669679','S',1,2011),('01669679','M',2,2822),('01669679','L',3,1384),('01669679','XL',4,625),('01669679','2XL',5,271),
  ('01669680','XS',0,845), ('01669680','S',1,1508),('01669680','M',2,2117),('01669680','L',3,1038),('01669680','XL',4,469),('01669680','2XL',5,204),
  ('01669677','XS',0,37),  ('01669677','S',1,111), ('01669677','M',2,292), ('01669677','L',3,213), ('01669677','XL',4,108),('01669677','2XL',5,63),

  -- MCKTM 17406-150 STROMMY WEATHER (IO 90/26)
  ('01669688','XS',0,814), ('01669688','S',1,2294),('01669688','M',2,4031),('01669688','L',3,2910),('01669688','XL',4,1586),('01669688','2XL',5,210),
  ('01669686','XS',0,46),  ('01669686','S',1,199), ('01669686','M',2,423), ('01669686','L',3,334), ('01669686','XL',4,162), ('01669686','2XL',5,72),
  ('01669689','XS',0,495), ('01669689','S',1,1396),('01669689','M',2,2455),('01669689','L',3,1771),('01669689','XL',4,966), ('01669689','2XL',5,128),
  ('01669690','XS',0,354), ('01669690','S',1,997), ('01669690','M',2,1752),('01669690','L',3,1265),('01669690','XL',4,690), ('01669690','2XL',5,92),
  ('01669687','XS',0,31),  ('01669687','S',1,133), ('01669687','M',2,282), ('01669687','L',3,223), ('01669687','XL',4,107), ('01669687','2XL',5,48),

  -- MCKTM 17410-150 STROMMY WEATHER (IO 89/26)
  ('01669693','XS',0,816), ('01669693','S',1,1964),('01669693','M',2,3840),('01669693','L',3,2953),('01669693','XL',4,1541),('01669693','2XL',5,216),
  ('01669691','XS',0,44),  ('01669691','S',1,170), ('01669691','M',2,355), ('01669691','L',3,290), ('01669691','XL',4,189), ('01669691','2XL',5,84),
  ('01669694','XS',0,519), ('01669694','S',1,1250),('01669694','M',2,2443),('01669694','L',3,1879),('01669694','XL',4,981), ('01669694','2XL',5,138),
  ('01669695','XS',0,360), ('01669695','S',1,866), ('01669695','M',2,1692),('01669695','L',3,1302),('01669695','XL',4,680), ('01669695','2XL',5,96),
  ('01669692','XS',0,30),  ('01669692','S',1,116), ('01669692','M',2,242), ('01669692','L',3,198), ('01669692','XL',4,129), ('01669692','2XL',5,58),

  -- MCKTM 17405-007 BLACK (IO 88/26)
  ('01669683','XS',0,1395),('01669683','S',1,2907),('01669683','M',2,4105),('01669683','L',3,2468),('01669683','XL',4,1102),('01669683','2XL',5,384),
  ('01669681','XS',0,57),  ('01669681','S',1,147), ('01669681','M',2,406), ('01669681','L',3,313), ('01669681','XL',4,206), ('01669681','2XL',5,107),
  ('01669684','XS',0,930), ('01669684','S',1,1937),('01669684','M',2,2737),('01669684','L',3,1645),('01669684','XL',4,734), ('01669684','2XL',5,256),
  ('01669685','XS',0,570), ('01669685','S',1,1187),('01669685','M',2,1677),('01669685','L',3,1007),('01669685','XL',4,450), ('01669685','2XL',5,157),
  ('01669682','XS',0,33),  ('01669682','S',1,86),  ('01669682','M',2,237), ('01669682','L',3,182), ('01669682','XL',4,121), ('01669682','2XL',5,63)
) as v(po_number, size_code, sort_order, quantity)
  on v.po_number = po.po_number;
