import Link from 'next/link';
export default function Home(){
    return (
        <main style={{padding:20}}>
        <h1>OTC Fund Prototype</h1>
        <ul>
        <li><Link href="/investor">Investor Portal</Link></li>
        <li><Link href="/manager">Manager Console</Link></li>
        <li><Link href="/auditor">Auditor View</Link></li>
        </ul>
        </main>
    );
}