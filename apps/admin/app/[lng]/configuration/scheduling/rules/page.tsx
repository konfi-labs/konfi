import { Metadata } from "next";
import { notFound } from "next/navigation";
import ScheduleRulesPage from "./rules-page";

export const metadata: Metadata = {
  title: "Schedule Rules",
};

export default function Page() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <ScheduleRulesPage />;
}
