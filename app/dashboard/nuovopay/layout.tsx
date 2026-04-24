import { requireNonVendorPage } from "@/lib/page-access";

export default async function NuovopayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
