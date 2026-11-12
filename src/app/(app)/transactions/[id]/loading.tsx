import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function TransactionTraceLoading() {
  return <PageSkeleton cards={4} rows={4} />;
}
