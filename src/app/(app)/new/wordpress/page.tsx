import type { Metadata } from "next";
import { WordPressForm } from "@/components/new/WordPressForm";

export const metadata: Metadata = { title: "New WordPress website" };

export default function NewWordPressPage() {
  return <WordPressForm />;
}
