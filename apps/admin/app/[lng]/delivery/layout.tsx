import CourierNavigation from "../components/layout/CourierNavigation";

export default async function CourierLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await params;

  return <CourierNavigation lng={lng}>{children}</CourierNavigation>;
}
