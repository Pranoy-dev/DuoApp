import { SignUp } from "@clerk/nextjs";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = params.redirect_url;
  const redirectUrl = Array.isArray(raw) ? raw[0] : raw;
  return (
    <div className="flex min-h-full flex-1 items-center justify-center safe-x py-8">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl={redirectUrl}
        fallbackRedirectUrl={redirectUrl || "/today"}
      />
    </div>
  );
}
