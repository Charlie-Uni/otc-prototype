import { useEffect, useState } from 'react';
export default function Manager(){
    const [nav, setNav] = useState('123456789');
    const [asOf, setAsOf] = useState<number>(Math.floor(Date.now()/1000));
    const [latest, setLatest] = useState<any>(null);
    useEffect(()=>{ fetch('http://localhost:3001/nav/latest').then(r=>r.json()).then(setLatest).catch(()=>{}); },[]);
    return (
        <main style={{padding:20}}>
            <h2>Manager Console</h2>
            <div>
                <h3>Post NAV</h3>
                <input value={nav} onChange={e=>setNav(e.target.value)} />
                <input value={asOf} onChange={e=>setAsOf(Number(e.target.value))} />
                <button onClick={async ()=>{
                    const r = await fetch('http://localhost:3001/nav/post', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nav, asOf})});
                    alert(await r.text());
                }}>Post NAV</button>
            </div>
            <div>
                <h3>Latest NAV</h3>
                <pre>{JSON.stringify(latest, null, 2)}</pre>
            </div>
        </main>
    );}