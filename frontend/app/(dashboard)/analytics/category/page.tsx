import { redirect } from 'next/navigation';

export default function AnalyticsCategoryPage() {
  redirect('/analytics?tab=category');
}
