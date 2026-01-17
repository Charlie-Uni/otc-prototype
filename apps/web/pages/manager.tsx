import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { Button, Card, Container, Field, H1, H2 } from "@/components/ui";

export default function Manager() {
  const [nav, setNav] = useState("123456789");
  const [asOf, setAsOf] = useState(String(Math.floor(Date.now()/1000)));
  const [latest, setLatest] = useState<{nav:string; asOf:string; storedAt:string}|null>(null);

  async function postNAV() {
    const res = await fetch(API("/nav/post"), {
      method: "POST",
      headers: {"content-type":"application/json"},
      body: JSON.stringify({ nav, asOf: Number(asOf) }),
    });
    if (!res.ok) alert("post failed");
    await load();
  }

  async function load() {
    const r = await fetch(API("/nav/latest"));
    if (r.ok) setLatest(await r.json());
  }

  useEffect(() => { load(); }, []);

  return (
    <Container>
      <H1>Manager Console</H1>

      <div className="grid gap-6">
        <Card>
          <H2>Post NAV</H2>
          <div className="flex flex-col items-start gap-3 sm:flex-row">
            <input className="w-full rounded-xl border px-3 py-2 text-sm"
                   value={nav} onChange={e=>setNav(e.target.value)} />
            <input className="w-full rounded-xl border px-3 py-2 text-sm"
                   value={asOf} onChange={e=>setAsOf(e.target.value)} />
            <Button onClick={postNAV}>Post NAV</Button>
          </div>
        </Card>

        <Card>
          <H2>Latest NAV</H2>
          {latest ? (
            <div className="space-y-1">
              <Field label="nav" value={latest.nav} />
              <Field label="asOf" value={latest.asOf} />
              <Field label="storedAt" value={latest.storedAt} />
            </div>
          ) : (
            <p className="text-sm text-gray-500">No NAV posted yet.</p>
          )}
        </Card>
      </div>
    </Container>
  );
}
