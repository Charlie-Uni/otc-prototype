create table if not exists investors (
    id serial primary key,
    address text unique not null,
    eligible boolean not null default false,
    vc_hash text
);


create table if not exists audit_log (
    id serial primary key,
    at timestamptz not null default now(),
    actor text not null,
    action text not null,
    occurred_at bigint,
    submitted_at bigint,
    disclosed_at bigint,
    observed_at bigint not null,
    transaction_hash text,
    payload jsonb not null default '{}'::jsonb
);

alter table audit_log add column if not exists occurred_at bigint;
alter table audit_log add column if not exists submitted_at bigint;
alter table audit_log add column if not exists disclosed_at bigint;
alter table audit_log add column if not exists observed_at bigint;
alter table audit_log add column if not exists transaction_hash text;

create table if not exists lifecycle_event (
    event_id text primary key,
    chain_id bigint not null,
    contract_address text not null,
    contract_name text not null,
    event_name text not null,
    category text not null,
    fund_id text not null,
    transaction_hash text not null,
    log_index integer not null,
    block_number bigint not null,
    occurred_at bigint not null,
    submitted_at bigint not null,
    commitment_hash text not null,
    payload jsonb not null,
    unique(chain_id, transaction_hash, log_index)
);

create index if not exists lifecycle_event_fund_time_idx
    on lifecycle_event(fund_id, occurred_at, submitted_at);
create index if not exists lifecycle_event_name_idx
    on lifecycle_event(event_name);
