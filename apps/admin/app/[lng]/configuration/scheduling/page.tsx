import { Metadata } from "next";
import { notFound } from "next/navigation";
import SchedulingPage from "./scheduling-page";

export const metadata: Metadata = {
  title: "Work Schedule",
};

export default function Page() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <SchedulingPage />;
}
