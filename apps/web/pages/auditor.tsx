import { API } from "@/lib/api";
import { Button, Card, Container, H1 } from "@/components/ui";


export default function Auditor() {
  function download() {
    window.location.href = API("/audit/export");
  }
  return (
    <Container>
      <H1>Auditor View</H1>
      <Card>
        <p className="mb-4 text-sm text-gray-600">
          Export all on-chain & off-chain actions as CSV for reconciliation.
        </p>
        <Button onClick={download}>Download CSV Export</Button>
      </Card>
    </Container>
  );
}
