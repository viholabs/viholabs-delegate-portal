export type EligibleActor = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  roles: string[];
};

export type RecommenderClientOption = {
  id: string;
  name: string | null;
  holdedContactId: string;
};

export type ClientDelegateInfo = {
  actorId: string;
  actorName: string | null;
  source: string | null;
  validFrom: string | null;
};

export type ClientRecommenderInfo = {
  clientId: string;
  clientName: string | null;
  source: string | null;
  validFrom: string | null;
};

export type ClientAffiliateInfo = {
  affiliateAccountId: string;
  affiliateName: string | null;
  affiliateEmail: string | null;
  affiliateExternalId: string | null;
  source: string | null;
  validFrom: string | null;
};

export type ClientActorInfo = {
  actorId: string;
  actorName: string | null;
  source: string | null;
  validFrom: string | null;
};

export type ClientItem = {
  id: string;
  name: string | null;
  holdedContactId: string;
  delegate: ClientDelegateInfo | null;
  recommender: ClientRecommenderInfo | null;
  affiliate?: ClientAffiliateInfo | null;
  kol?: ClientActorInfo | null;
  coordinator?: ClientActorInfo | null;
  commissionist_1?: ClientActorInfo | null;
  commissionist_2?: ClientActorInfo | null;
  commissionist_3?: ClientActorInfo | null;
  commissionist_4?: ClientActorInfo | null;
  commissionist_5?: ClientActorInfo | null;
};

export type ClientAssignmentsApiResponse = {
  ok: boolean;
  viewer?: {
    actorId: string;
    actorName: string | null;
    roles: string[];
    canManageClientAssignments?: boolean;
    canManageInvoiceOverrides?: boolean;
  };
  dictionaries?: {
    delegates: EligibleActor[];
    recommenders: RecommenderClientOption[];
    affiliates?: EditorAffiliateOption[];
    kols: EligibleActor[];
    coordinators: EligibleActor[];
    commissionists?: EligibleActor[];
  };
  clients?: ClientItem[];
  error?: string;
};

export type SaveBody =
  | {
      clientHoldedContactId: string;
      assignmentRole: "delegate";
      actorId: string | null;
    }
  | {
      clientHoldedContactId: string;
      assignmentRole: "recommender";
      recommenderClientId: string | null;
    }
  | {
      clientHoldedContactId: string;
      assignmentRole: "kol";
      actorId: string | null;
    }
  | {
      clientHoldedContactId: string;
      assignmentRole: "coordinator";
      actorId: string | null;
    }
  | {
      clientHoldedContactId: string;
      assignmentRole: "commissionist_1";
      actorId: string | null;
    }
  | {
      clientHoldedContactId: string;
      assignmentRole: "commissionist_2";
      actorId: string | null;
    }
  | {
      clientHoldedContactId: string;
      assignmentRole: "commissionist_3";
      actorId: string | null;
    }
  | {
      clientHoldedContactId: string;
      assignmentRole: "commissionist_4";
      actorId: string | null;
    }
  | {
      clientHoldedContactId: string;
      assignmentRole: "commissionist_5";
      actorId: string | null;
    };

export type Props = {
  title?: string;
};

export type EditorActorOption = {
  id: string;
  label: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

export type EditorAffiliateOption = {
  id: string;
  label: string;
  name: string | null;
  email: string | null;
  affiliate_external_id: string | null;
};

export type EditorOptionsResponse = {
  ok: boolean;
  actors?: EditorActorOption[];
  affiliates?: EditorAffiliateOption[];
  error?: string;
};

export type ElElyonInvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  client_id: string | null;
  client_name: string | null;

  delegate_id: string | null;
  delegate_name: string | null;
  delegate_source: "OVERRIDE_INVOICE" | "INVOICE_BASE" | "CLIENT_CURRENT" | "NONE";

  recommender_id: string | null;
  recommender_name: string | null;
  recommender_source: "OVERRIDE_INVOICE" | "INVOICE_BASE" | "NONE";

  affiliate_account_id: string | null;
  affiliate_name: string | null;
  affiliate_source: "OVERRIDE_INVOICE" | "ATTRIBUTION_CURRENT" | "NONE";

  source_provider: string | null;
  source_channel: string | null;

  state_code: string | null;
  source_month: string | null;
  total_net: number | string | null;
  total_gross: number | string | null;
  currency: string | null;
  is_paid: boolean | null;
  paid_date: string | null;

  override_meta: {
    delegate_assignment_id: string | null;
    recommender_assignment_id: string | null;
    affiliate_assignment_id: string | null;
  };
};

export type InvoicesResponse = {
  ok: boolean;
  month: string;
  count: number;
  rows: ElElyonInvoiceRow[];
  error?: string;
};

export type InvoiceOverrideResponse = {
  ok: boolean;
  changed?: boolean;
  target?: string;
  mode?: string;
  error?: string;
};