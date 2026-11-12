import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function DelegationGraphLoading() {
  return <PageSkeleton cards={3} rows={3} />;
}
