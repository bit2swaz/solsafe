'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AlertCircle, CheckCircle2, Fingerprint, LogOut, PlugZap, Wallet2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSiwsMessage, type DashboardSession, type SiwsChallenge } from '@/lib/siws';

type DashboardAuthPanelProps = {
  initialSession: DashboardSession | null;
  siwsConfigured: boolean;
};

export function DashboardAuthPanel({
  initialSession,
  siwsConfigured,
}: DashboardAuthPanelProps) {
  const router = useRouter();
  const { setVisible } = useWalletModal();
  const { connect, connected, connecting, disconnect, publicKey, signMessage, wallet } =
    useWallet();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const walletAddress = publicKey?.toBase58() ?? null;
  const authenticatedAddress = initialSession?.address ?? null;
  const isAuthenticated =
    Boolean(walletAddress) && walletAddress === authenticatedAddress;

  async function handleSelectWallet(): Promise<void> {
    setError(null);
    setVisible(true);
  }

  async function handleConnectWallet(): Promise<void> {
    try {
      setError(null);
      await connect();
    } catch (connectError) {
      setError(getErrorMessage(connectError, 'Failed to connect wallet.'));
    }
  }

  async function handleAuthenticate(): Promise<void> {
    if (!siwsConfigured) {
      setError('SIWS_SESSION_SECRET is not configured for the dashboard.');
      return;
    }

    if (!walletAddress || !signMessage) {
      setError('The selected wallet must support message signing for SIWS.');
      return;
    }

    try {
      setError(null);

      const challengeResponse = await fetch('/api/auth/siws/challenge', {
        method: 'POST',
      });
      const challengePayload = (await challengeResponse.json()) as {
        challenge?: SiwsChallenge;
        error?: string;
      };

      if (!challengeResponse.ok || !challengePayload.challenge) {
        throw new Error(
          challengePayload.error ?? 'Failed to create the SIWS challenge.',
        );
      }

      const message = createSiwsMessage({
        ...challengePayload.challenge,
        address: walletAddress,
      });
      const signatureBytes = await signMessage(new TextEncoder().encode(message));
      const verifyResponse = await fetch('/api/auth/siws/verify', {
        body: JSON.stringify({
          message,
          signature: encodeToBase64(signatureBytes),
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });
      const verifyPayload = (await verifyResponse.json()) as { error?: string };

      if (!verifyResponse.ok) {
        throw new Error(
          verifyPayload.error ?? 'Failed to verify the signed SIWS message.',
        );
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (authenticateError) {
      setError(
        getErrorMessage(authenticateError, 'Failed to authenticate wallet.'),
      );
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      setError(null);
      await fetch('/api/auth/logout', { method: 'POST' });
      startTransition(() => {
        router.refresh();
      });
    } catch (logoutError) {
      setError(getErrorMessage(logoutError, 'Failed to clear dashboard session.'));
    }
  }

  async function handleDisconnect(): Promise<void> {
    try {
      setError(null);
      await disconnect();
    } catch (disconnectError) {
      setError(getErrorMessage(disconnectError, 'Failed to disconnect wallet.'));
    }
  }

  return (
    <Card className="border-border/80 bg-background/75">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline">SIWS Auth</Badge>
          <StatusPill
            authenticatedAddress={authenticatedAddress}
            connected={connected}
            walletAddress={walletAddress}
          />
        </div>
        <CardTitle className="text-xl">Authenticate this dashboard session</CardTitle>
        <CardDescription>
          Use a connected Solana wallet to sign a nonce-backed SIWS challenge.
          The resulting session cookie keeps the dashboard scoped to your
          address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 rounded-[1.35rem] border border-border/70 bg-secondary/45 p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 text-foreground">
            <Wallet2 className="h-4 w-4" />
            <span className="font-medium">Wallet selection</span>
          </div>
          <p>
            {wallet
              ? `Selected wallet: ${wallet.adapter.name}`
              : 'Select a wallet to begin the connection flow.'}
          </p>
          <p>
            {walletAddress
              ? `Connected address: ${shortenAddress(walletAddress)}`
              : 'No wallet is connected yet.'}
          </p>
          <p>
            {authenticatedAddress
              ? `Active dashboard session: ${shortenAddress(authenticatedAddress)}`
              : 'No SIWS session has been established for this browser.'}
          </p>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-[1.15rem] border border-foreground/20 bg-foreground/5 p-4 text-sm text-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {!wallet ? (
            <Button className="min-w-44" onClick={handleSelectWallet}>
              Select wallet
            </Button>
          ) : !connected ? (
            <Button
              className="min-w-44"
              disabled={connecting || isPending}
              onClick={handleConnectWallet}
            >
              <PlugZap className="h-4 w-4" />
              {connecting ? 'Connecting...' : 'Connect wallet'}
            </Button>
          ) : (
            <Button
              className="min-w-52"
              disabled={isAuthenticated || isPending || !signMessage}
              onClick={handleAuthenticate}
            >
              <Fingerprint className="h-4 w-4" />
              {isAuthenticated
                ? 'Authenticated'
                : isPending
                  ? 'Refreshing session...'
                  : 'Authenticate with SIWS'}
            </Button>
          )}

          {wallet ? (
            <Button onClick={handleSelectWallet} variant="outline">
              Switch wallet
            </Button>
          ) : null}

          {connected ? (
            <Button onClick={handleDisconnect} variant="ghost">
              Disconnect
            </Button>
          ) : null}

          {authenticatedAddress ? (
            <Button onClick={handleLogout} variant="ghost">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          ) : null}
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {siwsConfigured
            ? 'Session cookies are signed server-side and scoped to the configured SIWS origin.'
            : 'SIWS is disabled until SIWS_SESSION_SECRET is configured.'}
        </p>
      </CardContent>
    </Card>
  );
}

function StatusPill(input: {
  authenticatedAddress: string | null;
  connected: boolean;
  walletAddress: string | null;
}) {
  if (input.connected && input.walletAddress && input.walletAddress === input.authenticatedAddress) {
    return (
      <Badge className="gap-2" variant="default">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Active
      </Badge>
    );
  }

  if (input.authenticatedAddress) {
    return <Badge variant="outline">Session only</Badge>;
  }

  return <Badge variant="secondary">Unsigned</Badge>;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function encodeToBase64(value: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value).toString('base64');
  }

  let binary = '';

  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}