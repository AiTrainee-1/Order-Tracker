-- ============================================================================
-- Buyer Order Quantity -> PO Size-wise Quantity -> Extra % -> Production
-- Quantity.
--
-- purchase_orders.quantity and po_size_quantities.quantity remain exactly
-- what the buyer ordered -  nothing about that changes. extra_percent is new:
-- the % a PO's production runs over the buyer's number (2 means +2%). It's
-- applied on top, on read, by effectiveSizes() in src/lib/sizes.ts -  never
-- baked into the stored buyer figures -  so the buyer's original quantity stays
-- visible as a reference and every PCS stage (Cutting onward) still measures
-- against the production number.
--
-- This migration also backfills the real size-wise breakdown (XS-2XL) for the
-- 4 MCKENZIE / JD SPORTS orders schema.sql already seeds -  those POs existed
-- with only a lump-sum quantity until now. Safe to re-run: the size insert
-- skips any PO that already has size rows, and the extra_percent update is
-- idempotent.
-- ============================================================================

alter table public.purchase_orders
  add column if not exists extra_percent numeric not null default 0;

-- --- Backfill size-wise buyer quantities from the original buying sheet -----

insert into public.po_size_quantities (po_id, size_code, sort_order, quantity)
select po.id, v.size_code, v.sort_order, v.quantity
from public.purchase_orders po
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
  on v.po_number = po.po_number
where not exists (
  select 1 from public.po_size_quantities existing where existing.po_id = po.id
);

-- --- These POs ship 2% over the buyer quantity, per the buying sheet --------

update public.purchase_orders
set extra_percent = 2
where po_number in (
  '01669678','01669676','01669679','01669680','01669677',
  '01669688','01669686','01669689','01669690','01669687',
  '01669693','01669691','01669694','01669695','01669692',
  '01669683','01669681','01669684','01669685','01669682'
);
