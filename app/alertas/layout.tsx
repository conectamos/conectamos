import { requireNonVendorPage } from "@/lib/page-access";

export default async function AlertasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
