import Link from "next/link";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { Badge, Button, Card, Container, Field, H1, H2 } from "@/components/ui";

export default function Investor() {
  const [addr, setAddr] = useState<string>("0x000…0001");
  const [risk, setRisk] = useState<"green" | "yellow" | "red">("green");
  const [balance, setBalance] = useState<string>("0");
  const [amount, setAmount] = useState("1000000000000000000"); // 1e18

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);

  async function refresh() {
    try {
      const r = await fetch(API("/health")); // cheap ping
      r.ok && setAddr("0x0000000000000000000000000000000000000001");

      const riskRes = await fetch(API("/risk"));
      if (riskRes.ok) {
        const { risk: tone } = await riskRes.json();
        setRisk((tone as any) ?? "green");
      }

      const balRes = await fetch(
        API("/token/balance/0x0000000000000000000000000000000000000001")
      );
      if (balRes.ok) {
        const { balance: b } = await balRes.json();
        setBalance(String(b));
      }
    } catch (e) {
      setMsg({ type: "err", text: "API not reachable. Is @ots/api running on :3001?" });
    }
  }

  async function subscribe() {
    setBusy(true);
    setMsg({ type: "info", text: "Submitting subscription..." });

    try {
      const res = await fetch(API("/token/subscribe"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: amount }),
      });

      await refresh();
      setMsg(res.ok ? { type: "ok", text: "Subscribed (minted fund tokens)." } : { type: "err", text: "Subscription failed." });
    } catch {
      setMsg({ type: "err", text: "Subscription failed (network/API error)." });
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    setBusy(true);
    setMsg({ type: "info", text: "Submitting redemption..." });

    try {
      const res = await fetch(API("/token/redeem"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: amount }),
      });

      await refresh();
      setMsg(res.ok ? { type: "ok", text: "Redeemed (burned fund tokens)." } : { type: "err", text: "Redeem failed." });
    } catch {
      setMsg({ type: "err", text: "Redeem failed (network/API error)." });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const msgStyle =
    msg?.type === "ok"
      ? "bg-green-50 text-green-800 border-green-200"
      : msg?.type === "err"
      ? "bg-red-50 text-red-800 border-red-200"
      : "bg-gray-50 text-gray-800 border-gray-200";

  return (
    <Container>
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <H1>Investor Portal</H1>
          <p className="text-sm text-gray-600">
            Simulate subscription (mint) and redemption (burn) against the local contracts.
          </p>
        </div>

        <Link
          href="/"
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          ← Home
        </Link>
      </div>

      {/* Status message */}
      {msg && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${msgStyle}`}>
          {msg.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Account card */}
        <Card className="lg:col-span-1">
          <H2>Account</H2>
          <div className="space-y-2">
            <Field label="Address" value={<code>{addr}</code>} />
            <Field label="Risk" value={<Badge tone={risk}>{risk}</Badge>} />
            <Field label="Balance" value={balance} />
          </div>

          <div className="mt-4">
            <Button variant="ghost" onClick={refresh} disabled={busy}>
              Refresh
            </Button>
          </div>
        </Card>

        {/* Action card */}
        <Card className="lg:col-span-2">
          <H2>Subscribe / Redeem</H2>
          <p className="text-sm text-gray-600">
            Amount is in <b>wei</b> (1e18 = 1 token unit in this prototype).
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Amount
              </label>
              <input
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-600/30"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1000000000000000000"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={subscribe} disabled={busy}>
                {busy ? "Working..." : "Mint (subscribe)"}
              </Button>
              <Button variant="ghost" onClick={redeem} disabled={busy}>
                {busy ? "Working..." : "Burn (redeem)"}
              </Button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <div className="font-semibold mb-1">What happens when you click?</div>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>Mint</b>: API calls your FundToken subscribe endpoint → contract mints tokens</li>
              <li><b>Burn</b>: API calls redeem endpoint → contract burns tokens</li>
              <li>Balance refresh reads on-chain balance and displays it here</li>
            </ul>
          </div>
        </Card>
      </div>
    </Container>
  );
}
