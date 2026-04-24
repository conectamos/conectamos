import { requireNonVendorPage } from "@/lib/page-access";

export default async function PrestamosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
