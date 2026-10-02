"""Generate the Supabase schema (supabase/migrations/0001_init.sql) and the
column map used by the data layer (src/api/schema.generated.js).

Every table keeps Base44's record shape: id, created_date, updated_date,
created_by. Known fields get typed columns; anything else the app writes is
kept in the `extra` jsonb column so no data is ever dropped.

Run: python3 scripts/gen_schema.py
"""
import json, re, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# Fields per entity, reconstructed from how the code reads and writes them.
ENTITIES = {
    "ActivityLog": "action_type brokerage_id browser details document_id ip_address location os user_agent user_email user_name",
    "AdminMessage": "brokerage_id content sender_email sender_name",
    "AgentSales": "agent_email agent_id agent_name brokerage_id month sales_amount",
    "Brokerage": "account_owner_id broker_name broker_title email name phone status welcome_message states",
    "BrokerageSettings": "brokerage_id brokerage_phone logo_url tech_links",
    "CMAsReport": "address bathrooms bedrooms brokerage_id cma_report notes status title user_email",
    "Channel": "brokerage_id emoji label name is_private topic created_by_email",
    "ChannelMember": "brokerage_id channel_id user_email user_name",
    "ClientReview": "agent_email agent_id agent_name brokerage_id client_name comment property_address rating reactions review_token status submitted",
    "Comment": "author_email author_name brokerage_id content idea_id mentions parent_comment_id",
    "ComplianceAttempt": "agent_email brokerage_id training_id score passed answers agent_name certificate_no certificate_url",
    "ComplianceQuestion": "explanation options order question_text question_type training_id correct_answer",
    "ComplianceTraining": "brokerage_id category description passing_score title type kind lessons minutes",
    "Conversation": "agent_email agent_name broker_email brokerage_id category handled_by last_message_preview status summary tags title",
    "CultureCalendarEntry": "brokerage_id created_by_email created_by_name date description event_type month person_email person_name title",
    "CultureCalendarRSVP": "brokerage_id culture_calendar_entry_id response_date status user_email user_name",
    "DashboardAnnouncement": "audio_url brokerage_id message posted_by_email posted_by_name",
    "DirectMessage": "brokerage_id edited_at content reactions read receiver_email receiver_id receiver_name receiver_photo sender_email sender_id sender_name sender_photo",
    "DocumentTemplate": "brokerage_id is_active",
    "ESignAuditLog": "action details document_id ip_address signer_email user_agent",
    "ESignDocument": "transaction_id algorithm audit_trail_pdf_url brokerage_id created_by_email created_by_name description document_hash document_url encrypted encryption_metadata fields final_signed_document_url iv name original_document_url require_sequential_signing signatories signature_fields signers slug status title version versions",
    "ESignSubmission": "brokerage_id completed_at created_by_email created_by_name document_id sequence_type signed_document_url signer_email signer_index signer_name signers status submitted_at template_id transaction_id",
    "ESignSubmitter": "email order signed submission_id",
    "ESignTemplate": "brokerage_id created_by_email document_url fields title",
    "Event": "brokerage_id date organizer_email organizer_name status",
    "EventRSVP": "brokerage_id checked_in dietary_notes event_id guests_count status user_email user_name",
    "FileRepository": "brokerage_id category description downloads_count file_name file_size file_url is_featured tags uploaded_by_email uploaded_by_name",
    "GeneratedContract": "brokerage_id buyer_name contract_text created_by_email created_by_name property_address purchase_price seller_name state",
    "GroupChat": "brokerage_id transaction_id auto_name created_by_email created_by_name members name",
    "GroupMessage": "brokerage_id edited_at mentions content group_id reactions sender_email sender_id sender_name sender_photo",
    "Idea": "admin_notes brokerage_id category description downvotes is_anonymous status submitter_email submitter_name title upvotes",
    "IdeaPadNote": "content messages title user_email",
    "Message": "brokerage_id content conversation_id read sender_email sender_name sender_role",
    "Notification": "action_url brokerage_id channel description read reference_id reference_type title type user_email",
    "CommissionPlan": "brokerage_id name description config is_default active",
    "CommissionRecord": "brokerage_id transaction_id agent_email agent_name property_address cap_year_start closed_date sale_price status gross_share company_dollar agent_net fees team_lead revshare_total calc approved_by approved_at",
    "Payout": "brokerage_id commission_record_id transaction_id payee_email payee_name kind level for_agent amount status approved_by approved_at payload_transaction_id payload_status sent_at paid_at failure_reason method memo",
    "AgentPrivate": "brokerage_id user_email payload_activation_id payload_payment_method_id bank_status bank_linked_at w9_file_uri tax_classification",
    "ChecklistTemplate": "brokerage_id name deal_type kind items active is_default",
    "Team": "brokerage_id name leader_email lead_pct",
    "Checklist": "brokerage_id subject_type subject_id subject_email template_id name items status",
    "TransactionContact": "brokerage_id transaction_id agent_email role name email phone company notes is_client contact_id",
    "Contact": "brokerage_id owner_email owner_name name email phone company type tags notes address birthday source",
    "ContractForm": "brokerage_id state form_type name description form_version document_url fields roles is_active created_by_email page_count",
    "ActivityEvent": "brokerage_id actor_email table_name op record_id transaction_id summary changed",
    "Offer": "brokerage_id agent_email agent_name property_address city state zip mls_number list_price offer_price earnest_money financing_type down_payment_percent loan_amount closing_date offer_expiration inspection_days financing_days appraisal_contingency seller_concessions included_items special_terms buyers sellers listing_agent_name listing_agent_email status offer_text document_url esign_document_id submission_id transaction_id accepted_at acceptance_date",
    "Onboarding": "agent_email agent_name brokerage_id items status",
    "Recognition": "brokerage_id category from_email from_name is_anonymous message reactions to_email to_name",
    "ScheduledCall": "agent_email agent_name brokerage_id status scheduled_at",
    "SignatureData": "fields ip_address signed_at signer_email signer_name submission_id user_agent",
    "SocialMessage": "brokerage_id edited_at call_id channel content mentions pinned pinned_by reactions read_by sender_email sender_name sender_photo",
    "ThreadReply": "brokerage_id edited_at mentions content message_id reactions sender_email sender_name sender_photo",
    "Transaction": "co_agents referral deductions commission_calc closed_date checklist_template_id thank_you_sent_at agent_email agent_name agent_net agent_split_percentage brokerage_fee brokerage_fee_flat brokerage_fee_percentage brokerage_fee_type brokerage_id buyer_name buyers checklist closing_date commission_amount commission_flat commission_notes commission_percentage commission_sale_price commission_type completed_dates documents esign_docs property_address sale_price seller_name sellers status tc_email tc_name transaction_fee transaction_fee_flat transaction_fee_percentage transaction_fee_type updates inspection_date appraisal_date financing_contingency_date inspection_contingency_date loan_approval_date title_deadline_date property_state",
    "UserBadge": "brokerage_id user_email badge_type",
    "Call": "brokerage_id room_name room_url kind title created_by_email created_by_name invitees conversation_kind conversation_key status started_at ended_at",
    "MarketingDesign": "brokerage_id owner_email title kind format template data thumbnail_url transaction_id listing_id",
    "PushSubscription": "brokerage_id user_email endpoint p256dh auth user_agent",
    "ChatReadState": "brokerage_id user_email kind conv_key last_read_at",
    "RoleplaySession": "brokerage_id agent_email agent_name scenario scenario_title difficulty status started_at ended_at duration_seconds transcript score scorecard",
    "PrintOrder": "brokerage_id owner_email owner_name product product_label vendor status quantity recipient_count sent_count failed_count amount_cents currency files ship_to recipients list_id design_id transaction_id stripe_session_id test_mode paid_at fulfilled_at vendor_ids tracking problems",
    "MailingList": "brokerage_id owner_email name recipients recipient_count source",
    "Story": "brokerage_id author_email author_name author_photo kind media_url media_type caption bg_color auto_type auto_key title subtitle image_url link pinned expires_at duration_seconds",
    "StoryView": "brokerage_id story_id viewer_email viewer_name reaction",
}

# User lives in `profiles`, linked 1:1 to Supabase auth.users.
USER_FIELDS = "email full_name display_name role brokerage_id suspended headshot agent_status duties license_number license_state license_expiration eo_expiration mls_ids phone start_date cap_start_date commission_plan_id team_lead_email sponsor_email first_name last_name personal_company birthday address city state zip alternate_name tc_email licenses annual_cap team_id permissions alerts_sent managed_states"

JSON_FIELDS = set("""co_agents referral deductions commission_calc config calc items changed mls_ids answers buyers checklist completed_dates details documents encryption_metadata esign_docs fields items
data members invitees mentions messages options reactions read_by sellers signatories signature_fields signers tags tech_links updates
versions cma_report roles states transcript scorecard lessons files ship_to recipients vendor_ids tracking problems""".split())
BOOL_FIELDS = set("test_mode auto_name is_private is_client is_default active appraisal_contingency read pinned encrypted suspended submitted checked_in is_active is_anonymous is_featured signed passed require_sequential_signing".split())
INT_FIELDS = set("minutes quantity recipient_count sent_count failed_count amount_cents level inspection_days financing_days bathrooms bedrooms downloads_count downvotes upvotes guests_count order passing_score rating signer_index version file_size score duration_seconds".split())
NUM_FIELDS = set("""lead_pct gross_share company_dollar agent_net fees team_lead revshare_total amount list_price offer_price earnest_money down_payment_percent loan_amount seller_concessions agent_net agent_split_percentage brokerage_fee brokerage_fee_flat brokerage_fee_percentage commission_amount
commission_flat commission_percentage commission_sale_price sale_price sales_amount transaction_fee transaction_fee_flat
transaction_fee_percentage purchase_price""".split())
DATE_FIELDS = set("cap_year_start closed_date license_expiration eo_expiration start_date cap_start_date acceptance_date date closing_date inspection_date appraisal_date financing_contingency_date inspection_contingency_date loan_approval_date title_deadline_date".split())
TS_FIELDS = set("expires_at fulfilled_at edited_at started_at ended_at last_read_at approved_at sent_at paid_at bank_linked_at thank_you_sent_at offer_expiration accepted_at completed_at submitted_at signed_at response_date scheduled_at".split())

# Tables not scoped by brokerage (owned by a user or reached via a parent)
PERSONAL = {"IdeaPadNote": "user_email", "ChatReadState": "user_email", "PushSubscription": "user_email"}

def snake(name):
    s = re.sub(r"(?<=[a-z0-9])([A-Z])", r"_\1", name).lower()
    return s.replace("c_m_as", "cmas").replace("e_sign", "esign").replace("r_s_v_p", "rsvp")

def coltype(f):
    if f in JSON_FIELDS: return "jsonb"
    if f in BOOL_FIELDS: return "boolean"
    if f in INT_FIELDS: return "integer"
    if f in NUM_FIELDS: return "numeric"
    if f in DATE_FIELDS: return "date"
    if f in TS_FIELDS: return "timestamptz"
    return "text"

def quote(c):
    return f'"{c}"' if c in ("order",) else c

out = []
w = out.append
w("-- Go Broker Hub schema. Generated by scripts/gen_schema.py; edit that file, not this one.")
w("-- Run once in the Supabase SQL editor (or `supabase db push`).\n")
w("create extension if not exists pgcrypto;\n")

# profiles
w("""-- Users -------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  display_name text,
  role text not null default 'user',
  brokerage_id text,
  suspended boolean default false,
  headshot text,
  agent_status text,
  -- Team duties, separate from permissions: 'tc' (transaction coordinator), 'compliance'
  duties jsonb not null default '[]'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);

alter table public.profiles add column if not exists duties jsonb not null default '[]'::jsonb;
-- Agent profile (back office)
alter table public.profiles add column if not exists license_number text;
alter table public.profiles add column if not exists license_state text;
alter table public.profiles add column if not exists license_expiration date;
alter table public.profiles add column if not exists eo_expiration date;
alter table public.profiles add column if not exists mls_ids jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists start_date date;
alter table public.profiles add column if not exists cap_start_date date;          -- cap year anniversary (defaults to start_date)
alter table public.profiles add column if not exists commission_plan_id text;
alter table public.profiles add column if not exists team_lead_email text;
alter table public.profiles add column if not exists sponsor_email text;           -- who recruited them (downline level 1)
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists personal_company text;
alter table public.profiles add column if not exists birthday date;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists state text;
alter table public.profiles add column if not exists zip text;
alter table public.profiles add column if not exists alternate_name text;
alter table public.profiles add column if not exists tc_email text;                -- this agent's assigned TC
alter table public.profiles add column if not exists licenses jsonb not null default '[]'::jsonb;  -- [{state, number, expiration}]
alter table public.profiles add column if not exists annual_cap numeric;           -- overrides the plan's cap
alter table public.profiles add column if not exists team_id text;
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists alerts_sent jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists managed_states jsonb not null default '[]'::jsonb;  -- state brokers: states they oversee
create index if not exists profiles_brokerage_idx on public.profiles (brokerage_id);

-- Create a profile row whenever someone signs up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers used by the security policies
SECOND_STEP_PART
create or replace function public.auth_email() returns text language sql stable as $$
  select case when public.second_step_ok() then lower(coalesce(auth.jwt()->>'email', '')) else '' end
$$;
create or replace function public.auth_brokerage_id() returns text
language sql stable security definer set search_path = public as $$
  select brokerage_id from public.profiles where id = auth.uid() and public.second_step_ok()
$$;
create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and public.second_step_ok()
$$;
create or replace function public.is_super_admin() returns boolean language sql stable as $$
  select coalesce(public.auth_role() = 'super_admin', false)
$$;
-- Legacy Base44 roles map onto the new ones: admin -> office_admin, user -> agent.
create or replace function public.normalize_role(r text) returns text language sql immutable as $$
  select case coalesce(r, 'agent') when 'admin' then 'office_admin' when 'user' then 'agent' when 'super_admin' then 'owner' else coalesce(r, 'agent') end
$$;
create or replace function public.is_brokerage_admin() returns boolean language sql stable as $$
  select coalesce(public.normalize_role(public.auth_role()) in ('owner', 'broker', 'office_admin'), false)
$$;

PERMISSIONS_PART

create or replace function public.touch_updated_date() returns trigger language plpgsql as $$
begin new.updated_date = now(); return new; end $$;

-- Base44 filled these in automatically; keep doing that so records never go missing
-- from a brokerage because a screen forgot to send brokerage_id.
create or replace function public.fill_owner() returns trigger language plpgsql as $$
begin
  if new.created_by is null then new.created_by := nullif(public.auth_email(), ''); end if;
  if new.brokerage_id is null then new.brokerage_id := public.auth_brokerage_id(); end if;
  return new;
end $$;
create or replace function public.fill_creator() returns trigger language plpgsql as $$
begin
  if new.created_by is null then new.created_by := nullif(public.auth_email(), ''); end if;
  return new;
end $$;

alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (
  id = auth.uid() or brokerage_id = public.auth_brokerage_id() or public.is_super_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid()
    and role = public.auth_role()
    and brokerage_id is not distinct from public.auth_brokerage_id());
-- Joining a brokerage or changing roles goes through server routes (service role).
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update using (
  (public.is_brokerage_admin() and brokerage_id = public.auth_brokerage_id()) or public.is_super_admin())
  with check (public.is_super_admin() or (role <> 'super_admin' and brokerage_id = public.auth_brokerage_id()));
-- Agents can edit their own profile, but not the fields that decide pay, permissions or team.
create or replace function public.guard_profile_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_brokerage_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.brokerage_id is distinct from old.brokerage_id
     or new.duties is distinct from old.duties
     or new.commission_plan_id is distinct from old.commission_plan_id
     or new.team_lead_email is distinct from old.team_lead_email
     or new.sponsor_email is distinct from old.sponsor_email
     or new.cap_start_date is distinct from old.cap_start_date
     or new.start_date is distinct from old.start_date
     or new.suspended is distinct from old.suspended
     or new.permissions is distinct from old.permissions
     or new.annual_cap is distinct from old.annual_cap
     or new.team_id is distinct from old.team_id
     or new.managed_states is distinct from old.managed_states
     or new.tc_email is distinct from old.tc_email then
    raise exception 'Only an admin can change role, permissions, team, states, plan, cap, TC or sponsor fields';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_self_edit();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_date();
""")

colmap = {"User": {"table": "profiles", "columns": USER_FIELDS.split() + ["id","created_date","updated_date","created_by"],
                    "typed": ["suspended", "duties", "mls_ids", "license_expiration", "eo_expiration", "start_date", "cap_start_date", "birthday", "licenses", "annual_cap", "permissions", "alerts_sent", "managed_states"]}}

pol = []
pw = pol.append
for ent, fields in sorted(ENTITIES.items()):
    t = snake(ent)
    fl = sorted(set(fields.split()))
    cols = [
        "  id text primary key default replace(gen_random_uuid()::text, '-', '')",
    ] + [f"  {quote(f)} {coltype(f)}" for f in fl] + [
        "  extra jsonb not null default '{}'::jsonb",
        "  created_date timestamptz not null default now()",
        "  updated_date timestamptz not null default now()",
        "  created_by text",
    ]
    w(f"-- {ent} " + "-" * (70 - len(ent)))
    w(f"create table if not exists public.{t} (\n" + ",\n".join(cols) + "\n);")
    # Re-running after an update adds any new columns to an existing table.
    for f in fl:
        w(f"alter table public.{t} add column if not exists {quote(f)} {coltype(f)};")
    w(f"drop trigger if exists {t}_touch on public.{t};")
    w(f"create trigger {t}_touch before update on public.{t} for each row execute function public.touch_updated_date();")
    fill = "fill_owner" if "brokerage_id" in fl else "fill_creator"
    w(f"drop trigger if exists {t}_fill on public.{t};")
    w(f"create trigger {t}_fill before insert on public.{t} for each row execute function public.{fill}();")
    w(f"alter table public.{t} enable row level security;")
    pw(f"drop policy if exists {t}_access on public.{t};")
    if ent in PERSONAL:
        k = PERSONAL[ent]
        pw(f"create policy {t}_access on public.{t} for all using (lower({k}) = public.auth_email()) with check (lower({k}) = public.auth_email());")
    elif ent == "DirectMessage":
        # Only the two people in it. Only the sender can edit or delete; "read" and reactions go through chat_* functions.
        pw(f"create policy {t}_access on public.{t} for select using (lower(sender_email) = public.auth_email() or lower(receiver_email) = public.auth_email() or public.is_super_admin());")
        for op in ("insert", "update", "delete"): pw(f"drop policy if exists {t}_{op} on public.{t};")
        pw(f"create policy {t}_insert on public.{t} for insert with check (lower(sender_email) = public.auth_email() and brokerage_id = public.auth_brokerage_id());")
        pw(f"create policy {t}_update on public.{t} for update using (lower(sender_email) = public.auth_email()) with check (lower(sender_email) = public.auth_email());")
        pw(f"create policy {t}_delete on public.{t} for delete using (lower(sender_email) = public.auth_email());")
    elif ent == "PrintOrder":
        # The agent who ordered it and the brokerage's admins can see it; only the server writes (payment and printing).
        pw(f"create policy {t}_access on public.{t} for select using (lower(owner_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin());")
        pw(f"-- {t}: written only by server routes.")
    elif ent in ("MarketingDesign", "MailingList"):
        pw(f"create policy {t}_access on public.{t} for all using (lower(owner_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() and (lower(owner_email) = public.auth_email() or public.is_brokerage_admin()));")
    elif ent == "Conversation":
        # Support chat: the agent who opened it and the brokerage's admins.
        pw(f"create policy {t}_access on public.{t} for all using (lower(agent_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
    elif ent == "Message":
        pw(f"create policy {t}_access on public.{t} for all using (exists (select 1 from public.conversation c where c.id = message.conversation_id) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() and exists (select 1 from public.conversation c where c.id = message.conversation_id));")
    elif ent == "AdminMessage":
        pw(f"create policy {t}_access on public.{t} for all using ((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin());")
    elif ent == "Channel":
        # Public channels: everyone in the brokerage. Private: members (and admins).
        pw(f"create policy {t}_access on public.{t} for select using (public.can_see_channel(brokerage_id, name));")
        pw(f"drop policy if exists {t}_admin on public.{t};")
        pw(f"create policy {t}_admin on public.{t} for all using (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) with check (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin());")
    elif ent == "ChannelMember":
        pw(f"create policy {t}_access on public.{t} for select using (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
        pw(f"drop policy if exists {t}_admin on public.{t};")
        pw(f"create policy {t}_admin on public.{t} for all using (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) with check (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin());")
    elif ent in ("SocialMessage", "ThreadReply", "GroupMessage"):
        see = {"SocialMessage": "public.can_see_channel(brokerage_id, channel)",
               "ThreadReply": "exists (select 1 from public.social_message m where m.id = thread_reply.message_id)",
               "GroupMessage": "exists (select 1 from public.group_chat g where g.id = group_message.group_id)"}[ent]
        pw(f"create policy {t}_access on public.{t} for select using ({see} or public.is_super_admin());")
        for op in ("insert", "update", "delete"): pw(f"drop policy if exists {t}_{op} on public.{t};")
        pw(f"create policy {t}_insert on public.{t} for insert with check (lower(sender_email) = public.auth_email() and brokerage_id = public.auth_brokerage_id() and {see});")
        mod = "(brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin())" if ent != "GroupMessage" else "false"
        pw(f"create policy {t}_update on public.{t} for update using (lower(sender_email) = public.auth_email() or {mod}) with check (brokerage_id = public.auth_brokerage_id());")
        pw(f"create policy {t}_delete on public.{t} for delete using (lower(sender_email) = public.auth_email() or {mod});")
    elif ent == "GroupChat":
        pw(f"create policy {t}_access on public.{t} for select using (public.in_members(members) or public.is_super_admin());")
        for op in ("insert", "update", "delete"): pw(f"drop policy if exists {t}_{op} on public.{t};")
        pw(f"create policy {t}_insert on public.{t} for insert with check (brokerage_id = public.auth_brokerage_id() and public.in_members(members));")
        pw(f"create policy {t}_update on public.{t} for update using (public.in_members(members)) with check (brokerage_id = public.auth_brokerage_id());")
        pw(f"create policy {t}_delete on public.{t} for delete using (lower(created_by_email) = public.auth_email());")
    elif ent == "Call":
        # Created and changed only by the server (callStart / callJoin / callEnd).
        pw(f"create policy {t}_access on public.{t} for select using (brokerage_id = public.auth_brokerage_id() and (lower(created_by_email) = public.auth_email()"
           f" or coalesce(invitees, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('email', public.auth_email()))"
           f" or (conversation_kind = 'channel' and public.can_see_channel(brokerage_id, conversation_key))) or public.is_super_admin());")
    elif ent == "Notification":
        pw(f"create policy {t}_access on public.{t} for all using (lower(user_email) = public.auth_email() or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or lower(user_email) = public.auth_email() or public.is_super_admin());")
    elif ent == "Transaction":
        # Private to the agents on the deal and its TC; admins see everything.
        cond = ("(lower(agent_email) = public.auth_email() or lower(tc_email) = public.auth_email()"
                " or coalesce(co_agents, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('email', public.auth_email()))"
                " or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('tx.all') or public.leads_agent(agent_email)))"
                " or public.is_super_admin())")
        # Everyone on the deal can see and change it (including status, e.g. Cancelled); only brokerage
        # admins can delete a deal.
        same = "(brokerage_id = public.auth_brokerage_id() or public.is_super_admin())"
        pw(f"create policy {t}_access on public.{t} for select using {cond};")
        for op in ("insert", "update", "delete"): pw(f"drop policy if exists {t}_{op} on public.{t};")
        pw(f"create policy {t}_insert on public.{t} for insert with check {same};")
        pw(f"create policy {t}_update on public.{t} for update using {cond} with check {same};")
        pw(f"create policy {t}_delete on public.{t} for delete using ((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin());")
    elif ent == "ComplianceTraining":
        # Everyone in the brokerage takes trainings; only admins add, change or remove them.
        pw(f"create policy {t}_access on public.{t} for select using (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
        for op in ("insert", "update", "delete"): pw(f"drop policy if exists {t}_{op} on public.{t};")
        adm = "((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin())"
        pw(f"create policy {t}_insert on public.{t} for insert with check {adm};")
        pw(f"create policy {t}_update on public.{t} for update using {adm} with check {adm};")
        pw(f"create policy {t}_delete on public.{t} for delete using {adm};")
    elif ent == "ComplianceAttempt":
        # Graded and recorded by the server (training route), so a score can't be made up.
        pw(f"create policy {t}_access on public.{t} for select using ((brokerage_id = public.auth_brokerage_id() and (lower(agent_email) = public.auth_email() or public.is_brokerage_admin())) or public.is_super_admin());")
        pw(f"-- {t}: written only by the server.")
    elif ent == "Story":
        # Seen by everyone in the brokerage until it expires; posted by the server (stories route).
        pw(f"create policy {t}_access on public.{t} for select using ((brokerage_id = public.auth_brokerage_id() and expires_at > now()) or public.is_super_admin());")
        pw(f"drop policy if exists {t}_delete on public.{t};")
        pw(f"create policy {t}_delete on public.{t} for delete using ((brokerage_id = public.auth_brokerage_id() and (lower(author_email) = public.auth_email() or public.is_brokerage_admin())) or public.is_super_admin());")
    elif ent == "StoryView":
        # Your own views; a story's author and the admins see who watched.
        mine = "lower(viewer_email) = public.auth_email()"
        pw(f"create policy {t}_access on public.{t} for select using ({mine} or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or exists (select 1 from public.story s where s.id = story_view.story_id and lower(s.author_email) = public.auth_email()))) or public.is_super_admin());")
        for op in ("insert", "update"): pw(f"drop policy if exists {t}_{op} on public.{t};")
        pw(f"create policy {t}_insert on public.{t} for insert with check ({mine} and brokerage_id = public.auth_brokerage_id() and exists (select 1 from public.story s where s.id = story_view.story_id and s.brokerage_id = public.auth_brokerage_id()));")
        pw(f"create policy {t}_update on public.{t} for update using ({mine}) with check ({mine} and brokerage_id = public.auth_brokerage_id());")
    elif ent == "Offer":
        cond = "(lower(agent_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('offers.all') or public.leads_agent(agent_email))) or public.is_super_admin())"
        pw(f"create policy {t}_access on public.{t} for all using {cond} with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
    elif ent == "ESignDocument":
        cond = ("(lower(created_by_email) = public.auth_email() or lower(created_by) = public.auth_email()"
                " or (transaction_id is not null and exists (select 1 from public.transaction x where x.id = esign_document.transaction_id))"
                " or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('tx.all'))) or public.is_super_admin())")
        pw(f"create policy {t}_access on public.{t} for all using {cond} with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
    elif ent == "Checklist":
        # Onboarding: the agent it's for + admins. Transaction checklists: whoever can see the deal.
        cond = ("(lower(subject_email) = public.auth_email()"
                " or (subject_type = 'transaction' and exists (select 1 from public.transaction x where x.id = checklist.subject_id))"
                " or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('docs.approve'))) or public.is_super_admin())")
        pw(f"create policy {t}_access on public.{t} for select using {cond};")
        pw(f"-- {t}: changes go through the checklistAction server route (keeps approvals honest).")
    elif ent in ("CommissionPlan", "ChecklistTemplate", "Team"):
        pw(f"create policy {t}_access on public.{t} for select using (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
        pw(f"drop policy if exists {t}_admin on public.{t};")
        pw(f"create policy {t}_admin on public.{t} for all using ((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin()) with check ((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin());")
    elif ent == "ContractForm":
        # Blank state forms. brokerage_id 'platform' = shared with every brokerage (super admin manages those).
        pw(f"create policy {t}_access on public.{t} for select using ((brokerage_id = 'platform' and public.brokerage_in_state({t}.state)) or brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
        for op in ("insert", "update", "delete"): pw(f"drop policy if exists {t}_{op} on public.{t};")
        cond = "((brokerage_id = public.auth_brokerage_id() and brokerage_id <> 'platform' and public.is_brokerage_admin()) or public.is_super_admin())"
        pw(f"create policy {t}_insert on public.{t} for insert with check {cond};")
        pw(f"create policy {t}_update on public.{t} for update using {cond} with check {cond};")
        pw(f"create policy {t}_delete on public.{t} for delete using {cond};")
    elif ent == "RoleplaySession":
        # Sales coach practice calls: the agent's own, plus admins (and anyone with company reports).
        pw(f"create policy {t}_access on public.{t} for select using (lower(agent_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('reports.company'))) or public.is_super_admin());")
        pw(f"-- {t}: written only by the salesRoleplay server route.")
    elif ent == "Contact":
        # Each agent's own contact book: theirs alone, plus brokerage admins (and anyone given contacts.private_all).
        pw(f"create policy {t}_access on public.{t} for all using (lower(owner_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('contacts.private_all'))) or public.is_super_admin()) with check ((brokerage_id = public.auth_brokerage_id() and (lower(owner_email) = public.auth_email() or public.is_brokerage_admin())) or public.is_super_admin());")
    elif ent == "TransactionContact":
        # Private to the agent on the deal (and its TC); admins see everything.
        cond = (f"(lower({t}.agent_email) = public.auth_email()"
                f" or exists (select 1 from public.transaction x where x.id = {t}.transaction_id and (lower(x.agent_email) = public.auth_email() or lower(x.tc_email) = public.auth_email()"
                f" or coalesce(x.co_agents, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('email', public.auth_email()))))"
                f" or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('contacts.private_all'))) or public.is_super_admin())")
        pw(f"create policy {t}_access on public.{t} for all using {cond} with check {cond};")
        pw("-- Co-agents are stored lower-case in transaction.co_agents: [{\"email\": ..., \"split_pct\": ...}]")
    elif ent == "CommissionRecord":
        pw(f"create policy {t}_access on public.{t} for select using (lower(agent_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('accounting.access'))) or public.is_super_admin());")
        pw(f"-- {t}: written only by server routes.")
    elif ent == "Payout":
        pw(f"create policy {t}_access on public.{t} for select using (lower(payee_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('accounting.access'))) or public.is_super_admin());")
        pw(f"-- {t}: written only by server routes (approvals and sending money).")
    elif ent == "AgentPrivate":
        pw(f"create policy {t}_access on public.{t} for select using (lower(user_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('accounting.access'))) or public.is_super_admin());")
        pw(f"-- {t}: written only by server routes.")
    elif ent == "ActivityEvent":
        pw(f"create policy {t}_access on public.{t} for select using ((brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('activity.account'))) or public.is_super_admin()"
           " or (transaction_id is not null and public.has_perm('activity.transaction') and exists (select 1 from public.transaction x where x.id = activity_event.transaction_id)));")
        pw(f"-- {t}: written by the activity trigger and server routes only.")
    elif ent == "ESignSubmission":
        # Visible when the document is visible (document rules apply through the subquery).
        pw(f"create policy {t}_access on public.{t} for all using (public.is_super_admin() or (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or lower(created_by_email) = public.auth_email() or exists (select 1 from public.esign_document d where d.id = {t}.document_id)) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
    elif ent == "ESignAuditLog":
        pw(f"create policy {t}_access on public.{t} for select using (public.is_super_admin() or exists (select 1 from public.esign_document d where d.id = {t}.document_id and d.brokerage_id = public.auth_brokerage_id()));")
    elif ent in ("SignatureData", "ESignSubmitter"):
        pw(f"create policy {t}_access on public.{t} for select using (public.is_super_admin() or exists (select 1 from public.esign_submission s where s.id = {t}.submission_id and (s.brokerage_id = public.auth_brokerage_id() or exists (select 1 from public.esign_document d where d.id = s.document_id and d.brokerage_id = public.auth_brokerage_id()))));")
    elif "brokerage_id" in fl:
        pw(f"create policy {t}_access on public.{t} for all using (brokerage_id = public.auth_brokerage_id() or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
    elif ent == "Brokerage":
        pw(f"create policy {t}_access on public.{t} for select using (id = public.auth_brokerage_id() or public.is_super_admin());")
        pw(f"drop policy if exists {t}_admin on public.{t};")
        pw(f"create policy {t}_admin on public.{t} for all using ((id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin());")
    else:
        # Child rows (questions, submitters, signature data, audit log): server-side only,
        # except compliance questions which agents read while taking a quiz.
        if ent == "ComplianceQuestion":
            # Answers stay hidden from learners: they get questions through the training route.
            own = "(exists (select 1 from public.compliance_training ct where ct.id = compliance_question.training_id and ct.brokerage_id = public.auth_brokerage_id()) and public.is_brokerage_admin()) or public.is_super_admin()"
            pw(f"create policy {t}_access on public.{t} for select using ({own});")
            pw(f"drop policy if exists {t}_admin on public.{t};")
            pw(f"create policy {t}_admin on public.{t} for all using ({own}) with check ({own});")
        else:
            pw(f"-- {t}: no client policy; reached only through server routes (service role).")
    if ent == "ESignSubmission":
        w(f"-- Signing links are looked up by token inside `signers`.")
        w(f"create index if not exists {t}_signers_gin on public.{t} using gin (signers jsonb_path_ops);")
    if ent == "ActivityEvent":
        w(f"create index if not exists {t}_recent_idx on public.{t} (brokerage_id, created_date desc);")
    for idx in ("owner_email", "contact_id", "brokerage_id", "agent_email", "payee_email", "transaction_id", "user_email", "document_id", "conversation_id", "submission_id", "channel", "group_id", "review_token", "slug"):
        if idx in fl:
            w(f"create index if not exists {t}_{idx}_idx on public.{t} ({idx});")
    w("")
    colmap[ent] = {"table": t, "columns": fl + ["id", "created_date", "updated_date", "created_by"],
                   "typed": [f for f in fl if coltype(f) != "text"]}

w("""-- Contract forms: is the signed-in user's brokerage assigned to this state? -------
create or replace function public.brokerage_in_state(p_state text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.brokerage b where b.id = public.auth_brokerage_id()
                 and coalesce(b.states, '[]'::jsonb) ? upper(coalesce(p_state, '')))
$$;
-- Only the platform owner assigns a brokerage's states (they decide which state forms it gets).
create or replace function public.guard_brokerage_states() returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_super_admin() then return new; end if;
  if tg_op = 'INSERT' then new.states := '[]'::jsonb;
  elsif coalesce(new.states, '[]'::jsonb) is distinct from coalesce(old.states, '[]'::jsonb) then new.states := old.states;
  end if;
  return new;
end $$;
drop trigger if exists brokerage_states_guard on public.brokerage;
create trigger brokerage_states_guard before insert or update on public.brokerage for each row execute function public.guard_brokerage_states();
""")
w("""-- Messaging helpers (need the chat tables, so they come after them) ----------
-- Can the signed-in user read this channel? Public channels: anyone in the brokerage.
-- Private channels (and legacy messages whose channel row is gone): members and admins.
create or replace function public.can_see_channel(p_brokerage text, p_channel text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_brokerage = public.auth_brokerage_id() and (
    public.is_brokerage_admin()
    or exists (select 1 from public.channel c where c.brokerage_id = p_brokerage and c.name = p_channel and not coalesce(c.is_private, false))
    or exists (select 1 from public.channel_member m where m.brokerage_id = p_brokerage and m.channel_id = p_channel and lower(m.user_email) = public.auth_email())
  ) or public.is_super_admin()
$$;
-- Is the signed-in user in a group chat's member list ([{id, email, ...}])?
create or replace function public.in_members(p_members jsonb) returns boolean
language sql stable as $$
  select exists (select 1 from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) m
                 where lower(m->>'email') = public.auth_email() or (m->>'id' = auth.uid()::text and public.second_step_ok()))
$$;
""")
w("-- Security rules ------------------------------------------------------------")
out.extend(pol)
w("")

# Realtime for the live chat and notification screens
live = ["notification", "social_message", "direct_message", "group_message", "message", "thread_reply",
        "conversation", "admin_message", "scheduled_call", "culture_calendar_entry", "profiles",
        "channel", "channel_member", "group_chat", "call"]
w("-- Live updates (chat, notifications) ---------------------------------------")
w("do $$ declare t text; begin")
w("  foreach t in array array[" + ",".join(f"'{x}'" for x in live) + "] loop")
w("    begin execute format('alter publication supabase_realtime add table public.%I', t);")
w("    exception when duplicate_object then null; end;")
w("  end loop; end $$;\n")

# Storage buckets
w("""-- File storage ---------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('public-files', 'public-files', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('private-files', 'private-files', false)
  on conflict (id) do nothing;
drop policy if exists "signed-in upload public" on storage.objects;
create policy "signed-in upload public" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-files');
drop policy if exists "anyone read public" on storage.objects;
create policy "anyone read public" on storage.objects for select using (bucket_id = 'public-files');
-- private-files: written and read only by server routes, which hand out short-lived signed URLs.
""")

os.makedirs(os.path.join(ROOT, "supabase/migrations"), exist_ok=True)
_part = open(os.path.join(HERE, "permissions.sql.part")).read()
_ss = open(os.path.join(HERE, "second_step.sql.part")).read()
out = [x.replace("PERMISSIONS_PART", _part) if "PERMISSIONS_PART" in x else x for x in out]
out = [x.replace("SECOND_STEP_PART", _ss) if "SECOND_STEP_PART" in x else x for x in out]
open(os.path.join(ROOT, "supabase/migrations/0001_init.sql"), "w").write("\n".join(out))
open(os.path.join(ROOT, "src/api/schema.generated.js"), "w").write(
    "// Generated by scripts/gen_schema.py. Maps each Base44 entity to its Supabase table.\n"
    "export const SCHEMA = " + json.dumps(colmap, indent=2) + ";\n")
print(f"{len(colmap)} tables written")
