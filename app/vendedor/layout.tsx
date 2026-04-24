import { requireVendorPage } from "@/lib/page-access";

export default async function VendedorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVendorPage();

  return children;
}
