import { requireNonVendorPage } from "@/lib/page-access";

export default async function InventarioPrincipalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
