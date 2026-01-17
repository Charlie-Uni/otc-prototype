create table if not exists investors (
    id serial primary key,
    address text unique not null,
    eligible boolean not null default false,
    vc_hash text
);


create table if not exists audit_log (
    id serial primary key,
    at timestamptz default now(),
    actor text,
    action text,
    payload jsonb
);