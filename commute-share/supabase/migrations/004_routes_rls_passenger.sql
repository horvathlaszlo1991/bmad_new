-- Goal 3: Allow passengers to discover active routes from other drivers.
-- The existing owner-only SELECT policy covers drivers viewing their own routes.
-- Supabase ORs multiple policies together, so adding this policy alongside the
-- existing "Drivers can manage their own routes" SELECT policy means:
--   • a driver sees their own routes (via the owner policy)
--   • any authenticated user sees other drivers' active routes (via this policy)

DROP POLICY IF EXISTS "Passengers can discover active routes" ON routes;
CREATE POLICY "Passengers can discover active routes"
  ON routes
  FOR SELECT
  USING (status = 'active' AND driver_id != auth.uid());
