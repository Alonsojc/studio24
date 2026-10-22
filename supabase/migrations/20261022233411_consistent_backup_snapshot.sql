-- All SELECTs in the logical export share the calling statement's snapshot.
alter function public.export_business_snapshot() stable;
