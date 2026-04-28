import { requireNonVendorPage } from "@/lib/page-access";

export default async function DashboardAnaliticoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
