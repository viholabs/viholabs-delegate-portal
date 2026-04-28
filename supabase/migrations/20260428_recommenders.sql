-- Módulo Recomendadores
-- Un recomendador es un cliente que refiere a otros clientes a un delegado específico.
-- El delegado es el propietario del recomendador (relación 1-a-muchos).
-- La comisión del recomendador se deduce de la liquidación del delegado.

-- ---------------------------------------------------------------------------
-- Tabla principal: recommenders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recommenders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegate_actor_id    UUID NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  client_id            UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  email                TEXT,
  phone                TEXT,
  commission_pct       DECIMAL(5,2) NOT NULL DEFAULT 0
                         CHECK (commission_pct >= 0 AND commission_pct <= 100),
  notes                TEXT,
  active               BOOLEAN NOT NULL DEFAULT true,
  state_code           VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recommenders_delegate_actor_id_idx ON public.recommenders(delegate_actor_id);
CREATE INDEX IF NOT EXISTS recommenders_client_id_idx         ON public.recommenders(client_id);

ALTER TABLE public.recommenders ENABLE ROW LEVEL SECURITY;

-- Supervisores ven todos
CREATE POLICY recommenders_supervisor_read ON public.recommenders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN','ADMINISTRATIVE','COORDINATOR_COMMERCIAL','COORDINATOR_CECT','KOL')
    )
  );

-- Delegado ve sólo los suyos
CREATE POLICY recommenders_delegate_read ON public.recommenders
  FOR SELECT USING (
    delegate_actor_id = (
      SELECT a.id FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
      LIMIT 1
    )
  );

-- Insert: solo supervisores (gestión desde panel interno)
CREATE POLICY recommenders_supervisor_insert ON public.recommenders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN','ADMINISTRATIVE','COORDINATOR_COMMERCIAL','COORDINATOR_CECT','KOL')
    )
  );

-- Update: solo supervisores
CREATE POLICY recommenders_supervisor_update ON public.recommenders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN','ADMINISTRATIVE','COORDINATOR_COMMERCIAL','COORDINATOR_CECT','KOL')
    )
  );

-- Delete: solo Melquisedec/Super_admin
CREATE POLICY recommenders_supervisor_delete ON public.recommenders
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- Asignaciones de clientes a recomendadores
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recommender_client_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommender_id   UUID NOT NULL REFERENCES public.recommenders(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  commission_pct   DECIMAL(5,2)
                     CHECK (commission_pct IS NULL OR (commission_pct >= 0 AND commission_pct <= 100)),
  valid_from       DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to         DATE,
  state_code       VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(recommender_id, client_id)
);

CREATE INDEX IF NOT EXISTS rca_recommender_id_idx ON public.recommender_client_assignments(recommender_id);
CREATE INDEX IF NOT EXISTS rca_client_id_idx      ON public.recommender_client_assignments(client_id);

ALTER TABLE public.recommender_client_assignments ENABLE ROW LEVEL SECURITY;

-- Heredar visibilidad del recomendador padre
CREATE POLICY rca_supervisor_read ON public.recommender_client_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN','ADMINISTRATIVE','COORDINATOR_COMMERCIAL','COORDINATOR_CECT','KOL')
    )
  );

CREATE POLICY rca_delegate_read ON public.recommender_client_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recommenders r
      JOIN public.actors a ON a.id = r.delegate_actor_id
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND r.id = recommender_id
    )
  );

CREATE POLICY rca_supervisor_insert ON public.recommender_client_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN','ADMINISTRATIVE','COORDINATOR_COMMERCIAL','COORDINATOR_CECT','KOL')
    )
  );

CREATE POLICY rca_supervisor_update ON public.recommender_client_assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN','ADMINISTRATIVE','COORDINATOR_COMMERCIAL','COORDINATOR_CECT','KOL')
    )
  );

CREATE POLICY rca_supervisor_delete ON public.recommender_client_assignments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- Añadir columna a commission_settlement_proposals para comisiones de recomendadores
-- ---------------------------------------------------------------------------

ALTER TABLE public.commission_settlement_proposals
  ADD COLUMN IF NOT EXISTS total_recommender_commissions_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
