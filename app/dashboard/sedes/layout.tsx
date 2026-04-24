import { requireNonVendorPage } from "@/lib/page-access";

export default async function DashboardSedesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
