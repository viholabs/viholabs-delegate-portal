-- CRM Followups: registro de interacciones actor-cliente
-- No hay tabla 'delegates' — los delegados son actors con role='DELEGATE'
-- delegate_actor_id = actors.id del delegado responsable del seguimiento

CREATE TABLE IF NOT EXISTS public.crm_followups (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegate_actor_id    UUID NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  client_id            UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by_actor_id  UUID REFERENCES public.actors(id) ON DELETE SET NULL,
  type                 TEXT NOT NULL CHECK (type IN ('call','whatsapp','email','visit','incident','note')),
  note                 TEXT NOT NULL CHECK (char_length(note) > 0),
  next_action_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_followups_delegate_actor_id_idx ON public.crm_followups(delegate_actor_id);
CREATE INDEX IF NOT EXISTS crm_followups_client_id_idx         ON public.crm_followups(client_id);
CREATE INDEX IF NOT EXISTS crm_followups_created_at_idx        ON public.crm_followups(created_at DESC);

ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;

-- Supervisores ven todo
CREATE POLICY crm_followups_supervisor_read ON public.crm_followups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN','ADMINISTRATIVE','COORDINATOR_COMMERCIAL','COORDINATOR_CECT','KOL')
    )
  );

-- Delegados ven sólo los suyos
CREATE POLICY crm_followups_delegate_read ON public.crm_followups
  FOR SELECT USING (
    delegate_actor_id = (
      SELECT a.id FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
      LIMIT 1
    )
  );

-- Insert: el propio delegado o un supervisor
CREATE POLICY crm_followups_insert ON public.crm_followups
  FOR INSERT WITH CHECK (
    delegate_actor_id = (
      SELECT a.id FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
      LIMIT 1
    )
    OR EXISTS (
      SELECT 1 FROM public.actors a
      JOIN public.actor_users au ON au.actor_id = a.id
      WHERE au.user_id = auth.uid()
        AND a.role IN ('MELQUISEDEC','SUPER_ADMIN','ADMINISTRATIVE','COORDINATOR_COMMERCIAL','COORDINATOR_CECT','KOL')
    )
  );
