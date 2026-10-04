"use client";

import { Badge, Text } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Ticks the "last cycle Ns ago" counter every second so it counts up live between
// the 10s server polls. Server still owns the source of truth (lastCycleAt, cycleCount).
// The worker's heartbeat arrives as an ISO string with an offset; an offset-less
// string is treated as UTC.
function parseTs(s: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
}

export function HeartbeatBadge({ lastCycleAt, cycleCount }: { lastCycleAt: string | null; cycleCount: number | null }) {
  // null until mounted: server and first client render must match (no Date.now() in SSR HTML).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!lastCycleAt) return <Badge color="red">no heartbeat yet</Badge>;
  if (now === null)
    return (
      <Text size="2" color="gray">
        <Badge color="gray">…</Badge> {cycleCount} cycles
      </Text>
    );
  const age = (now - parseTs(lastCycleAt)) / 1000;
  if (Number.isFinite(age) && age < 180)
    return (
      <Text size="2" color="gray">
        <Badge color="green">running</Badge> last cycle {Math.floor(age)}s ago · {cycleCount} cycles
      </Text>
    );
  return (
    <Text size="2" color="gray">
      <Badge color="red">stale</Badge> last cycle {new Date(parseTs(lastCycleAt)).toLocaleString()} · {cycleCount}{" "}
      cycles
    </Text>
  );
}

// ponytail: poll-refresh the server component; data changes per scrape cycle (~minutes),
// so 10s is plenty. Swap to SSE only if updates ever get frequent + latency-sensitive.
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
