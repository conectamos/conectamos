import { requireNonVendorPage } from "@/lib/page-access";

export default async function InventarioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
