"use client";
import { useParams } from "next/navigation";
import { SessionView } from "@/components/cham-bai/SessionView";

// Dùng useParams để chạy được cả Next 14 lẫn Next 15.
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <SessionView id={id} />;
}
