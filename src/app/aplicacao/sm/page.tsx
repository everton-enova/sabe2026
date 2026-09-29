import { ApplicationForm } from "@/components/application-form";
import { PrazoEncerrado } from "@/components/prazo-encerrado";
import { getDeadline, isExpired } from "@/lib/prazo";

export const dynamic = "force-dynamic";

export default function SmPage() {
  if (isExpired(getDeadline("sm"))) {
    return <PrazoEncerrado titulo="Supervisor Municipal" mode="sm" />;
  }
  return <ApplicationForm mode="sm" />;
}
