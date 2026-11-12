import { requirePageAuth } from "@/lib/auth/guards";
import { AppShell } from "@/components/shell/app-shell";
import { platformKeys } from "@/lib/crypto/keys";
import { getPayPalConfig } from "@/lib/paypal";
import { isGeminiConfigured } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePageAuth();
  const { keyId } = platformKeys();

  return (
    <AppShell
      user={auth.user}
      signingKeyId={keyId}
      paypalConfigured={Boolean(getPayPalConfig())}
      geminiConfigured={isGeminiConfigured()}
    >
      {children}
    </AppShell>
  );
}
