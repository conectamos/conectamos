import { requireNonVendorPage } from "@/lib/page-access";

export default async function VentasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
