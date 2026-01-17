import Link from "next/link";

export default function Home() {
  return (
    <div
      style={{
        maxWidth: 900,
        margin: "40px auto",
        padding: "0 20px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 42, marginBottom: 8 }}>OTC Fund Prototype</h1>
      <p style={{ color: "#555", marginTop: 0, marginBottom: 28 }}>
        Choose a portal to simulate the fund workflow (local Anvil + API + UI).
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <BigButton
          href="/investor"
          title="Investor Portal"
          desc="Mint (subscribe), burn (redeem), view balance."
        />
        <BigButton
          href="/manager"
          title="Manager Console"
          desc="Post NAV, view latest NAV on-chain."
        />
        <BigButton
          href="/auditor"
          title="Auditor View"
          desc="Download CSV export of actions for auditing."
        />
      </div>

      <div
        style={{
          marginTop: 28,
          padding: 16,
          border: "1px solid #eee",
          borderRadius: 12,
          background: "#fafafa",
          fontSize: 14,
          color: "#444",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Quick sanity check</div>
        <div>Web UI: http://localhost:3000</div>
        <div>API: http://localhost:3001</div>
        <div>Chain: Anvil (chainId 31337)</div>
      </div>
    </div>
  );
}

function BigButton({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        style={{
          border: "1px solid #e6e6e6",
          borderRadius: 14,
          padding: 18,
          background: "white",
          cursor: "pointer",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: "#555", marginTop: 6 }}>{desc}</div>

        <div
          style={{
            marginTop: 14,
            display: "inline-block",
            padding: "10px 14px",
            borderRadius: 10,
            background: "#111",
            color: "white",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Open →
        </div>
      </div>
    </Link>
  );
}
