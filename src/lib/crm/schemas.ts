import { z } from "zod";

export const Month01Schema = z.string().regex(/^\d{4}-\d{2}-01$/);

export const ClientSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  status: z.enum(["active", "sleeping", "archived"]).default("active"),
  created_at: z.string().datetime(),
  last_activity_at: z.string().datetime().nullable().optional(),
  is_recommender: z.boolean().optional(),
});

export const ManualOrderSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  month: Month01Schema,
  order_date: z.string().datetime(),
  status: z.enum(["draft", "submitted", "paid", "cancelled"]).default("draft"),
  units_sale: z.number().int().nonnegative(),
  units_foc: z.number().int().nonnegative().default(0),
  amount_net_estimated: z.number().nonnegative().nullable().optional(),
});

export const FollowUpSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  created_at: z.string().datetime(),
  type: z.enum(["call", "whatsapp", "email", "visit", "incident", "note"]),
  note: z.string().min(1),
  next_action_at: z.string().datetime().nullable().optional(),
});

export const DashboardCommercialSchema = z.object({
  ok: z.boolean(),
  month: Month01Schema,

  top_clients: z.array(
    z.object({
      client: ClientSchema,
      units_paid: z.number().int().nonnegative(),
      contribution_pct: z.number().min(0).max(100),
      trend: z.enum(["up", "flat", "down"]).optional(),
    })
  ),

  recommender_tree: z.array(
    z.object({
      recommender: ClientSchema,
      recommended: z.array(
        z.object({
          client: ClientSchema,
          units_paid: z.number().int().nonnegative(),
        })
      ),
      units_paid_total: z.number().int().nonnegative(),
      commission_deducted_estimated: z.number().nonnegative(),
    })
  ),

  sleeping_clients: z.array(
    z.object({
      client: ClientSchema,
      days_since_last: z.number().int().nonnegative(),
      last_units: z.number().int().nonnegative().optional(),
      severity: z.enum(["warn", "risk", "critical"]),
    })
  ),
});

export type Client = z.infer<typeof ClientSchema>;
export type ManualOrder = z.infer<typeof ManualOrderSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;
export type DashboardCommercial = z.infer<typeof DashboardCommercialSchema>;
