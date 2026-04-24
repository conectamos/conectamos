import { requireNonVendorPage } from "@/lib/page-access";

export default async function CajaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  return children;
}
