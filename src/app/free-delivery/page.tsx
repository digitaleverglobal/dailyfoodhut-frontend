import type { Metadata } from "next";
import CollectionPage from "@/components/CollectionPage";

export const revalidate = 60;

export const metadata: Metadata = { title: "Free Delivery - Daily Food Hut" };

export default function FreeDeliveryPage() {
  return (
    <CollectionPage
      title="Free Delivery"
      filter={(p) => Boolean(p.freeShipping)}
      emptyText="এই মুহূর্তে ফ্রি ডেলিভারির কোনো পণ্য নেই।"
    />
  );
}
