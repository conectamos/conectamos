import { requireNonVendorPage } from "@/lib/page-access";

export default async function PayjoyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
