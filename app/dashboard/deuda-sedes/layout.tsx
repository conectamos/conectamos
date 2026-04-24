import { requireNonVendorPage } from "@/lib/page-access";

export default async function DeudaSedesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
