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
    "Brokerage": "account_owner_id broker_name broker_title email name phone status welcome_message",
    "BrokerageSettings": "brokerage_id brokerage_phone logo_url tech_links",
    "CMAsReport": "address bathrooms bedrooms brokerage_id cma_report notes status title user_email",
    "Channel": "brokerage_id emoji label name",
    "ChannelMember": "brokerage_id channel_id user_email user_name",
    "ClientReview": "agent_email agent_id agent_name brokerage_id client_name comment property_address rating reactions review_token status submitted",
    "Comment": "author_email author_name brokerage_id content idea_id mentions parent_comment_id",
    "ComplianceAttempt": "agent_email brokerage_id training_id score passed answers",
    "ComplianceQuestion": "explanation options order question_text question_type training_id correct_answer",
    "ComplianceTraining": "brokerage_id category description passing_score title type",
    "Conversation": "agent_email agent_name broker_email brokerage_id category handled_by last_message_preview status summary tags title",
    "CultureCalendarEntry": "brokerage_id created_by_email created_by_name date description event_type month person_email person_name title",
    "CultureCalendarRSVP": "brokerage_id culture_calendar_entry_id response_date status user_email user_name",
    "DashboardAnnouncement": "audio_url brokerage_id message posted_by_email posted_by_name",
    "DirectMessage": "brokerage_id content reactions read receiver_email receiver_id receiver_name receiver_photo sender_email sender_id sender_name sender_photo",
    "DocumentTemplate": "brokerage_id is_active",
    "ESignAuditLog": "action details document_id ip_address signer_email user_agent",
    "ESignDocument": "algorithm audit_trail_pdf_url brokerage_id created_by_email created_by_name description document_hash document_url encrypted encryption_metadata fields final_signed_document_url iv name original_document_url require_sequential_signing signatories signature_fields signers slug status title version versions",
    "ESignSubmission": "brokerage_id completed_at created_by_email created_by_name document_id sequence_type signed_document_url signer_email signer_index signer_name signers status submitted_at template_id transaction_id",
    "ESignSubmitter": "email order signed submission_id",
    "ESignTemplate": "brokerage_id created_by_email document_url fields title",
    "Event": "brokerage_id date organizer_email organizer_name status",
    "EventRSVP": "brokerage_id checked_in dietary_notes event_id guests_count status user_email user_name",
    "FileRepository": "brokerage_id category description downloads_count file_name file_size file_url is_featured tags uploaded_by_email uploaded_by_name",
    "GeneratedContract": "brokerage_id buyer_name contract_text created_by_email created_by_name property_address purchase_price seller_name state",
    "GroupChat": "brokerage_id created_by_email created_by_name members name",
    "GroupMessage": "brokerage_id content group_id reactions sender_email sender_id sender_name sender_photo",
    "Idea": "admin_notes brokerage_id category description downvotes is_anonymous status submitter_email submitter_name title upvotes",
    "IdeaPadNote": "content messages title user_email",
    "Message": "brokerage_id content conversation_id read sender_email sender_name sender_role",
    "Notification": "action_url brokerage_id channel description read reference_id reference_type title type user_email",
    "Onboarding": "agent_email agent_name brokerage_id items status",
    "Recognition": "brokerage_id category from_email from_name is_anonymous message reactions to_email to_name",
    "ScheduledCall": "agent_email agent_name brokerage_id status scheduled_at",
    "SignatureData": "fields ip_address signed_at signer_email signer_name submission_id user_agent",
    "SocialMessage": "brokerage_id channel content mentions pinned pinned_by reactions read_by sender_email sender_name sender_photo",
    "ThreadReply": "brokerage_id content message_id reactions sender_email sender_name sender_photo",
    "Transaction": "agent_email agent_name agent_net agent_split_percentage brokerage_fee brokerage_fee_flat brokerage_fee_percentage brokerage_fee_type brokerage_id buyer_name buyers checklist closing_date commission_amount commission_flat commission_notes commission_percentage commission_sale_price commission_type completed_dates documents esign_docs property_address sale_price seller_name sellers status tc_email tc_name transaction_fee transaction_fee_flat transaction_fee_percentage transaction_fee_type updates inspection_date appraisal_date financing_contingency_date inspection_contingency_date loan_approval_date title_deadline_date",
    "UserBadge": "brokerage_id user_email badge_type",
}

# User lives in `profiles`, linked 1:1 to Supabase auth.users.
USER_FIELDS = "email full_name display_name role brokerage_id suspended headshot agent_status"

JSON_FIELDS = set("""answers buyers checklist completed_dates details documents encryption_metadata esign_docs fields items
members mentions messages options reactions read_by sellers signatories signature_fields signers tags tech_links updates
versions cma_report""".split())
BOOL_FIELDS = set("read pinned encrypted suspended submitted checked_in is_active is_anonymous is_featured signed passed require_sequential_signing".split())
INT_FIELDS = set("bathrooms bedrooms downloads_count downvotes upvotes guests_count order passing_score rating signer_index version file_size score".split())
NUM_FIELDS = set("""agent_net agent_split_percentage brokerage_fee brokerage_fee_flat brokerage_fee_percentage commission_amount
commission_flat commission_percentage commission_sale_price sale_price sales_amount transaction_fee transaction_fee_flat
transaction_fee_percentage purchase_price""".split())
DATE_FIELDS = set("date closing_date inspection_date appraisal_date financing_contingency_date inspection_contingency_date loan_approval_date title_deadline_date".split())
TS_FIELDS = set("completed_at submitted_at signed_at response_date scheduled_at".split())

# Tables not scoped by brokerage (owned by a user or reached via a parent)
PERSONAL = {"IdeaPadNote": "user_email"}

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
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);

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
create or replace function public.auth_email() returns text language sql stable as $$
  select lower(coalesce(auth.jwt()->>'email', ''))
$$;
create or replace function public.auth_brokerage_id() returns text
language sql stable security definer set search_path = public as $$
  select brokerage_id from public.profiles where id = auth.uid()
$$;
create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.is_super_admin() returns boolean language sql stable as $$
  select coalesce(public.auth_role() = 'super_admin', false)
$$;
create or replace function public.is_brokerage_admin() returns boolean language sql stable as $$
  select coalesce(public.auth_role() in ('admin','broker','super_admin'), false)
$$;

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
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_date();
""")

colmap = {"User": {"table": "profiles", "columns": USER_FIELDS.split() + ["id","created_date","updated_date","created_by"],
                    "typed": ["suspended"]}}

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
        pw(f"create policy {t}_access on public.{t} for all using (lower(sender_email) = public.auth_email() or lower(receiver_email) = public.auth_email() or public.is_super_admin()) with check (lower(sender_email) = public.auth_email() or lower(receiver_email) = public.auth_email());")
    elif ent == "Notification":
        pw(f"create policy {t}_access on public.{t} for all using (lower(user_email) = public.auth_email() or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or lower(user_email) = public.auth_email() or public.is_super_admin());")
    elif ent == "ESignSubmission":
        pw(f"create policy {t}_access on public.{t} for all using (brokerage_id = public.auth_brokerage_id() or public.is_super_admin() or exists (select 1 from public.esign_document d where d.id = {t}.document_id and d.brokerage_id = public.auth_brokerage_id())) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());")
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
            pw(f"create policy {t}_access on public.{t} for select using (auth.uid() is not null);")
            pw(f"drop policy if exists {t}_admin on public.{t};")
            pw(f"create policy {t}_admin on public.{t} for all using (public.is_brokerage_admin());")
        else:
            pw(f"-- {t}: no client policy; reached only through server routes (service role).")
    for idx in ("brokerage_id", "user_email", "document_id", "conversation_id", "submission_id", "channel", "group_id", "review_token", "slug"):
        if idx in fl:
            w(f"create index if not exists {t}_{idx}_idx on public.{t} ({idx});")
    w("")
    colmap[ent] = {"table": t, "columns": fl + ["id", "created_date", "updated_date", "created_by"],
                   "typed": [f for f in fl if coltype(f) != "text"]}

w("-- Security rules ------------------------------------------------------------")
out.extend(pol)
w("")

# Realtime for the live chat and notification screens
live = ["notification", "social_message", "direct_message", "group_message", "message", "thread_reply",
        "conversation", "admin_message", "scheduled_call", "culture_calendar_entry", "profiles"]
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
open(os.path.join(ROOT, "supabase/migrations/0001_init.sql"), "w").write("\n".join(out))
open(os.path.join(ROOT, "src/api/schema.generated.js"), "w").write(
    "// Generated by scripts/gen_schema.py. Maps each Base44 entity to its Supabase table.\n"
    "export const SCHEMA = " + json.dumps(colmap, indent=2) + ";\n")
print(f"{len(colmap)} tables written")
