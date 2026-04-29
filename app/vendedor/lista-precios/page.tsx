import { requireVendorPage } from "@/lib/page-access";
import ListaPreciosVendedorWorkspace from "./workspace";

export default async function ListaPreciosVendedorPage() {
  await requireVendorPage();

  return <ListaPreciosVendedorWorkspace />;
}
