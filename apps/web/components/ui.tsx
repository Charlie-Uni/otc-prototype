import React from "react";

export function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>;
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white shadow-soft ring-1 ring-black/5">
      <div className="p-5">{children}</div>
    </div>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-6 text-2xl font-semibold tracking-tight">{children}</h1>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-semibold">{children}</h2>;
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }
) {
  const { variant = "primary", className = "", ...rest } = props;
  const base =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition";
  const styles =
    variant === "primary"
      ? "bg-brand-600 text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
      : "text-gray-700 hover:bg-gray-100";
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function Badge({ tone, children }:{tone:"green"|"yellow"|"red", children:React.ReactNode}) {
  const map = {
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-700",
  } as const;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>;
}

export function Field({ label, value }:{label:string; value:React.ReactNode}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
