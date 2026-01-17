import { useEffect, useState } from 'react';


    export default function Investor(){
    const [addr, setAddr] = useState('0x0000000000000000000000000000000000000001');
    const [bal, setBal] = useState('0');
    const [amt, setAmt] = useState('1000000000000000000');
    const [risk, setRisk] = useState('green');


    useEffect(() => {
        fetch(`http://localhost:3001/token/balance/${addr}`).then(r=>r.json()).then(d=>setBal(d.balance));
        fetch(`http://localhost:3001/risk`).then(r=>r.json()).then(d=>setRisk(d.status));
    }, [addr]);


    return (
        <main style={{padding:20}}>
            <h2>Investor Portal</h2>
            <div>Address: <input value={addr} onChange={e=>setAddr(e.target.value)} style={{width:480}}/></div>
            <div>Risk: <b>{risk}</b></div>
            <div>Balance: <b>{bal}</b></div>
            <hr/>
            <h3>Subscribe</h3>
            <input value={amt} onChange={e=>setAmt(e.target.value)} style={{width:480}}/>
            <button onClick={async ()=>{
                const r = await fetch('http://localhost:3001/token/subscribe', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({to: addr, amount: amt})});
                alert(await r.text());
            }}>Mint (subscribe)</button>
            <button onClick={async ()=>{
                const r = await fetch('http://localhost:3001/token/redeem', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({from: addr, amount: amt})});
                alert(await r.text());
            }}>Burn (redeem)</button>
        </main>
    );}