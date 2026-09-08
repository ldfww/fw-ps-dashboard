do $$
begin
    if not exists (select 1 from pg_type where typname = 'app_role') then
        create type public.app_role as enum ('admin', 'manager', 'agent');
    end if;
end$$;

create or replace function public.has_role(user_id uuid, required_role public.app_role)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    return exists (
        select 1 from public.user_roles
        where id = user_id and role = required_role
    );
end;
$$;

create table if not exists public.profiles (
    id uuid primary key references auth.users on delete cascade,
    email text not null,
    full_name text,
    active boolean default true,
    created_at timestamptz default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists active boolean default true;
alter table public.profiles add column if not exists created_at timestamptz default now();
update public.profiles p set email = u.email from auth.users u where p.id = u.id and p.email is null;

alter table public.profiles enable row level security;

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
    on public.profiles for select
    using (auth.uid() = id);

drop policy if exists "Managers can read all profiles" on public.profiles;
create policy "Managers can read all profiles"
    on public.profiles for select
    using (public.has_role(auth.uid(), 'manager'::app_role));

drop policy if exists "Admins can manage all profiles" on public.profiles;
create policy "Admins can manage all profiles"
    on public.profiles for all
    using (public.has_role(auth.uid(), 'admin'::app_role));

-- Roles stored separately; never on profiles
create table if not exists public.user_roles (
    id uuid primary key references auth.users on delete cascade,
    role public.app_role not null default 'agent',
    updated_at timestamptz default now()
);

alter table public.user_roles enable row level security;

grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

drop policy if exists "Users can read own role" on public.user_roles;
create policy "Users can read own role"
    on public.user_roles for select
    using (auth.uid() = id);

drop policy if exists "Managers can read roles" on public.user_roles;
create policy "Managers can read roles"
    on public.user_roles for select
    using (public.has_role(auth.uid(), 'manager'::app_role));

drop policy if exists "Admins can manage roles" on public.user_roles;
create policy "Admins can manage roles"
    on public.user_roles for all
    using (public.has_role(auth.uid(), 'admin'::app_role));

-- SECURITY DEFINER helper
create or replace function public.has_role(user_id uuid, required_role app_role)
returns boolean
language plpgsql
security definer
as $$
begin
    return exists (
        select 1 from public.user_roles
        where id = user_id and role = required_role
    );
end;
$$;

-- Auto-grant manager to the first registered account
create or replace function public.grant_first_user_manager()
returns trigger
language plpgsql
security definer
as $$
begin
    if not exists (
        select 1 from public.user_roles
        where id <> new.id and role = 'manager'
    ) then
        insert into public.user_roles (id, role)
        values (new.id, 'manager')
        on conflict (id) do update set role = 'manager';
    end if;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.grant_first_user_manager();

-- ViciDial agent time entries
create table if not exists public.agent_time_entries (
    id bigserial primary key,
    agent_id text not null,
    agent_name text,
    user_group text,
    entry_date date not null,
    talk_time_secs int default 0,
    wait_time_secs int default 0,
    pause_time_secs int default 0,
    calls int default 0,
    updated_at timestamptz default now(),
    unique (agent_id, entry_date)
);

alter table public.agent_time_entries enable row level security;

grant select, insert, update, delete on public.agent_time_entries to authenticated;
grant all on public.agent_time_entries to service_role;

drop policy if exists "Managers can manage agent_time_entries" on public.agent_time_entries;
create policy "Managers can manage agent_time_entries"
    on public.agent_time_entries for all
    using (public.has_role(auth.uid(), 'manager'::app_role));

drop policy if exists "Agents can read own agent_time_entries" on public.agent_time_entries;
create policy "Agents can read own agent_time_entries"
    on public.agent_time_entries for select
    using (public.has_role(auth.uid(), 'agent'::app_role) and agent_id = (select email from public.profiles where id = auth.uid()));

-- ForthCRM users
create table if not exists public.forth_users (
    id text primary key,
    firstname text,
    lastname text,
    user_name text,
    role_name text,
    active boolean default true,
    updated_at timestamptz default now()
);

alter table public.forth_users add column if not exists role_name text;
alter table public.forth_users add column if not exists active boolean default true;
alter table public.forth_users enable row level security;
grant select, insert, update, delete on public.forth_users to authenticated;
grant all on public.forth_users to service_role;

drop policy if exists "Managers can read all forth_users" on public.forth_users;
create policy "Managers can read all forth_users"
    on public.forth_users for all
    using (public.has_role(auth.uid(), 'manager'::app_role));

-- ForthCRM tasks
create table if not exists public.forth_tasks (
    id text primary key,
    contact_id text,
    user_id text not null,
    firstname text,
    lastname text,
    user_name text,
    title text,
    task_note text,
    task_due_date date,
    task_status text,
    task_completed boolean,
    task_completed_date date,
    task_created_date date,
    updated_at timestamptz default now(),
    unique (id, user_id)
);

alter table public.forth_tasks enable row level security;

grant select, insert, update, delete on public.forth_tasks to authenticated;
grant all on public.forth_tasks to service_role;

drop policy if exists "Managers can read all forth_tasks" on public.forth_tasks;
create policy "Managers can read all forth_tasks"
    on public.forth_tasks for all
    using (public.has_role(auth.uid(), 'manager'::app_role));

drop policy if exists "Agents can read own forth_tasks" on public.forth_tasks;
create policy "Agents can read own forth_tasks"
    on public.forth_tasks for select
    using (public.has_role(auth.uid(), 'agent'::app_role) and user_id = (select email from public.profiles where id = auth.uid()));

-- Gmail counts
create table if not exists public.email_counts (
    id bigserial primary key,
    mailbox text not null,
    counted_date date not null,
    received int default 0,
    opened int default 0,
    unopened int default 0,
    updated_at timestamptz default now(),
    unique (mailbox, counted_date)
);

alter table public.email_counts enable row level security;

grant select, insert, update, delete on public.email_counts to authenticated;
grant all on public.email_counts to service_role;

drop policy if exists "Managers can manage email_counts" on public.email_counts;
create policy "Managers can manage email_counts"
    on public.email_counts for all
    using (public.has_role(auth.uid(), 'manager'::app_role));

drop policy if exists "Agents can read email_counts" on public.email_counts;
create policy "Agents can read email_counts"
    on public.email_counts for select
    using (public.has_role(auth.uid(), 'agent'::app_role));

-- Supervisor spreadsheet log
create table if not exists public.sheet_tasks (
    id bigserial primary key,
    agent_id text not null,
    log_date date not null,
    tasks_assigned int default 0,
    updated_at timestamptz default now(),
    unique (agent_id, log_date)
);

alter table public.sheet_tasks enable row level security;

grant select, insert, update, delete on public.sheet_tasks to authenticated;
grant all on public.sheet_tasks to service_role;

drop policy if exists "Managers can manage sheet_tasks" on public.sheet_tasks;
create policy "Managers can manage sheet_tasks"
    on public.sheet_tasks for all
    using (public.has_role(auth.uid(), 'manager'::app_role));

drop policy if exists "Agents can read own sheet_tasks" on public.sheet_tasks;
create policy "Agents can read own sheet_tasks"
    on public.sheet_tasks for select
    using (public.has_role(auth.uid(), 'agent'::app_role) and agent_id = (select email from public.profiles where id = auth.uid()));

-- Sales closing ratio records from supervisor spreadsheet
create table if not exists public.sales_closing_records (
    id bigserial primary key,
    date_range text not null,
    start_date date,
    end_date date,
    agent_id text not null,
    is_total boolean default false,
    booked_sales int default 0,
    paid_sales int default 0,
    red_nsf int default 0,
    gray_pending_cancel int default 0,
    closing_ratio numeric(5,2) default 0,
    cancelled_clients int default 0,
    white_scheduled int default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (date_range, agent_id, is_total)
);

alter table public.sales_closing_records enable row level security;
grant select, insert, update, delete on public.sales_closing_records to authenticated;
grant all on public.sales_closing_records to service_role;

drop policy if exists "Managers can manage sales_closing_records" on public.sales_closing_records;
create policy "Managers can manage sales_closing_records"
    on public.sales_closing_records for all
    using (public.has_role(auth.uid(), 'manager'::app_role));

drop policy if exists "Agents can read own sales_closing_records" on public.sales_closing_records;
create policy "Agents can read own sales_closing_records"
    on public.sales_closing_records for select
    using (public.has_role(auth.uid(), 'agent'::app_role) and agent_id = (select email from public.profiles where id = auth.uid()));

-- Nightly snapshots for trends
create table if not exists public.report_snapshots (
    id bigserial primary key,
    snapshot_date date not null,
    source text not null,
    agent_id text,
    metric text not null,
    value int default 0,
    updated_at timestamptz default now(),
    unique (snapshot_date, source, agent_id, metric)
);

alter table public.report_snapshots enable row level security;

grant select, insert, update, delete on public.report_snapshots to authenticated;
grant all on public.report_snapshots to service_role;

drop policy if exists "Managers can manage report_snapshots" on public.report_snapshots;
create policy "Managers can manage report_snapshots"
    on public.report_snapshots for all
    using (public.has_role(auth.uid(), 'manager'::app_role));

drop policy if exists "Agents can read own report_snapshots" on public.report_snapshots;
create policy "Agents can read own report_snapshots"
    on public.report_snapshots for select
    using (public.has_role(auth.uid(), 'agent'::app_role) and agent_id = (select email from public.profiles where id = auth.uid()));

-- Threshold alerts
create table if not exists public.threshold_alerts (
    id bigserial primary key,
    agent_id text not null,
    source text not null,
    metric text not null,
    threshold int not null,
    observed int not null,
    created_at timestamptz default now()
);

alter table public.threshold_alerts enable row level security;

grant select, insert, update, delete on public.threshold_alerts to authenticated;
grant all on public.threshold_alerts to service_role;

drop policy if exists "Managers can manage threshold_alerts" on public.threshold_alerts;
create policy "Managers can manage threshold_alerts"
    on public.threshold_alerts for all
    using (public.has_role(auth.uid(), 'manager'::app_role));

drop policy if exists "Agents can read own threshold_alerts" on public.threshold_alerts;
create policy "Agents can read own threshold_alerts"
    on public.threshold_alerts for select
    using (public.has_role(auth.uid(), 'agent'::app_role) and agent_id = (select email from public.profiles where id = auth.uid()));
