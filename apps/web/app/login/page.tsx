import { AuthForm } from "@/components/auth-form";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main id="main-content" className="mx-auto max-w-md px-5 py-12"><AuthForm initialError={params.error === "link" ? "This email link is invalid or expired. Request a new one." : undefined} /></main>;
}
