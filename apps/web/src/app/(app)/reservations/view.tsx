// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  ExternalLink,
  Mail,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@/components";
import type { ReservationActivityEventResponse } from "@/contracts/reservations.activity.v1.contract";
import type { ConnectionsOutput } from "@/contracts/reservations.connections.v1.contract";
import type { WatchRequestResponse } from "@/contracts/reservations.watch.v1.contract";
import {
  captureResyConnection,
  createWatch,
  fetchActivity,
  fetchConnections,
  fetchWatches,
  renewGmailWatch,
  startGmailConnection,
  updateWatchStatus,
} from "./_api/reservation-api";

const STATUS_INTENT = {
  active: "default",
  paused: "secondary",
  fulfilled: "outline",
  cancelled: "destructive",
  expired: "secondary",
  reconnect_required: "destructive",
  connected: "default",
  disconnected: "secondary",
  pending: "secondary",
  error: "destructive",
} as const;

function StatusBadge({ status }: { status: string }): ReactElement {
  return (
    <Badge
      intent={
        STATUS_INTENT[status as keyof typeof STATUS_INTENT] ?? "secondary"
      }
      size="sm"
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ConnectionCard({
  title,
  description,
  status,
  meta,
  actions,
}: {
  title: string;
  description: string;
  status: string;
  meta: ReactElement;
  actions: ReactElement;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <StatusBadge status={status} />
      </CardHeader>
      <CardContent className="space-y-3">
        {meta}
        {actions}
      </CardContent>
    </Card>
  );
}

function ConnectionsSection({
  connections,
}: {
  connections: ConnectionsOutput;
}): ReactElement {
  const queryClient = useQueryClient();

  const gmailStartMutation = useMutation({
    mutationFn: startGmailConnection,
    onSuccess: (result) => {
      window.open(
        result.authorizationUrl,
        "gmail-connect",
        "width=520,height=720"
      );
    },
  });

  const gmailRenewMutation = useMutation({
    mutationFn: renewGmailWatch,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["reservation-connections"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["reservation-activity"],
      });
    },
  });

  const resyCaptureMutation = useMutation({
    mutationFn: () => captureResyConnection(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["reservation-connections"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["reservation-activity"],
      });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConnectionCard
        title="Connect Gmail"
        description="Official Gmail OAuth and Gmail watch registration for Resy Notify ingestion."
        status={connections.gmail.status}
        meta={
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              Account:{" "}
              {connections.gmail.providerAccountEmail ?? "Not connected"}
            </p>
            <p className="text-muted-foreground">
              Watch: {connections.gmail.watchStatus} /{" "}
              {connections.gmail.renewalStatus}
            </p>
            {connections.gmail.watchExpiryAt && (
              <p className="text-muted-foreground">
                Expires: {formatDateTime(connections.gmail.watchExpiryAt)}
              </p>
            )}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => gmailStartMutation.mutate()}
              disabled={gmailStartMutation.isPending}
            >
              <Mail className="mr-2 size-4" />
              {connections.gmail.status === "connected"
                ? "Reconnect Gmail"
                : "Connect Gmail"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => gmailRenewMutation.mutate()}
              disabled={
                gmailRenewMutation.isPending ||
                connections.gmail.status !== "connected"
              }
            >
              <RefreshCcw className="mr-2 size-4" />
              Renew Watch
            </Button>
          </div>
        }
      />

      <ConnectionCard
        title="Connect Resy"
        description="Launch a short-lived controlled browser login and store encrypted Playwright state."
        status={connections.resy.status}
        meta={
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              Session: {connections.resy.sessionStatus ?? "Not captured"}
            </p>
            {connections.resy.lastVerifiedAt && (
              <p className="text-muted-foreground">
                Verified: {formatDateTime(connections.resy.lastVerifiedAt)}
              </p>
            )}
          </div>
        }
        actions={
          <Button
            size="sm"
            onClick={() => resyCaptureMutation.mutate()}
            disabled={resyCaptureMutation.isPending}
          >
            <ShieldCheck className="mr-2 size-4" />
            {connections.resy.status === "connected"
              ? "Reconnect Resy"
              : "Capture Resy Session"}
          </Button>
        }
      />
    </div>
  );
}

function WatchForm(): ReactElement {
  const queryClient = useQueryClient();
  const [restaurant, setRestaurant] = useState("");
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [timeStart, setTimeStart] = useState("18:00");
  const [timeEnd, setTimeEnd] = useState("21:00");
  const [idealTime, setIdealTime] = useState("19:00");
  const [autoClaim, setAutoClaim] = useState(true);

  const mutation = useMutation({
    mutationFn: createWatch,
    onSuccess: () => {
      setRestaurant("");
      setRestaurantSlug("");
      setPartySize("2");
      setDateStart("");
      setDateEnd("");
      setTimeStart("18:00");
      setTimeEnd("21:00");
      setIdealTime("19:00");
      setAutoClaim(true);
      void queryClient.invalidateQueries({ queryKey: ["reservation-watches"] });
      void queryClient.invalidateQueries({
        queryKey: ["reservation-activity"],
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create Watch</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <Input
          value={restaurant}
          onChange={(event) => setRestaurant(event.target.value)}
          placeholder="Restaurant"
        />
        <Input
          value={restaurantSlug}
          onChange={(event) => setRestaurantSlug(event.target.value)}
          placeholder="Optional Resy slug"
        />
        <Input
          type="number"
          min="1"
          value={partySize}
          onChange={(event) => setPartySize(event.target.value)}
          placeholder="Party size"
        />
        <Input
          type="date"
          value={dateStart}
          onChange={(event) => setDateStart(event.target.value)}
        />
        <Input
          type="date"
          value={dateEnd}
          onChange={(event) => setDateEnd(event.target.value)}
        />
        <Input
          type="time"
          value={timeStart}
          onChange={(event) => setTimeStart(event.target.value)}
        />
        <Input
          type="time"
          value={timeEnd}
          onChange={(event) => setTimeEnd(event.target.value)}
        />
        <Input
          type="time"
          value={idealTime}
          onChange={(event) => setIdealTime(event.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoClaim}
            onChange={(event) => setAutoClaim(event.target.checked)}
          />
          Enable auto-claim
        </label>
        <div className="md:col-span-2">
          <Button
            onClick={() =>
              mutation.mutate({
                restaurant,
                restaurantSlug: restaurantSlug || undefined,
                partySize: Number.parseInt(partySize, 10),
                dateStart: new Date(dateStart).toISOString(),
                dateEnd: new Date(dateEnd).toISOString(),
                timeStart,
                timeEnd,
                idealTime,
                autoClaim,
              })
            }
            disabled={
              mutation.isPending ||
              !restaurant ||
              !dateStart ||
              !dateEnd ||
              Number.isNaN(Number.parseInt(partySize, 10))
            }
          >
            Create Watch
          </Button>
          {mutation.error && (
            <p className="mt-2 text-destructive text-sm">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Failed to create watch"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WatchesSection({
  watches,
}: {
  watches: WatchRequestResponse[];
}): ReactElement {
  const queryClient = useQueryClient();
  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "active" | "paused" | "cancelled";
    }) => updateWatchStatus(id, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservation-watches"] });
      void queryClient.invalidateQueries({
        queryKey: ["reservation-activity"],
      });
    },
  });

  return (
    <div className="space-y-3">
      {watches.map((watch) => (
        <Card key={watch.id}>
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{watch.restaurant}</h3>
                <StatusBadge status={watch.status} />
                {watch.autoClaim && <Badge size="sm">auto-claim</Badge>}
              </div>
              <div className="flex flex-wrap gap-3 text-muted-foreground text-sm">
                <span>Party of {watch.partySize}</span>
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {formatDate(watch.dateStart)} - {formatDate(watch.dateEnd)}
                </span>
                <span>
                  {watch.timeStart} - {watch.timeEnd}
                </span>
              </div>
              {watch.notifySetupUrl && (
                <a
                  href={watch.notifySetupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary text-sm"
                >
                  Open Resy Notify setup <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  statusMutation.mutate({
                    id: watch.id,
                    status: watch.status === "active" ? "paused" : "active",
                  })
                }
                disabled={
                  statusMutation.isPending ||
                  (watch.status !== "active" && watch.status !== "paused")
                }
              >
                {watch.status === "active" ? "Pause" : "Resume"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  statusMutation.mutate({ id: watch.id, status: "cancelled" })
                }
                disabled={statusMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {watches.length === 0 && (
        <Card>
          <CardContent className="p-6 text-muted-foreground text-sm">
            No watches yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActivitySection({
  events,
}: {
  events: ReservationActivityEventResponse[];
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((event) => (
          <div key={event.id} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">
                  {event.eventType.replaceAll("_", " ")}
                </p>
                <p className="text-muted-foreground text-xs">
                  via {event.source}
                </p>
              </div>
              <span className="text-muted-foreground text-xs">
                {formatDateTime(event.createdAt)}
              </span>
            </div>
            {event.payloadJson && (
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(event.payloadJson, null, 2)}
              </pre>
            )}
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ReservationsView(): ReactElement {
  const connectionsQuery = useQuery({
    queryKey: ["reservation-connections"],
    queryFn: fetchConnections,
    refetchInterval: 5000,
  });
  const watchesQuery = useQuery({
    queryKey: ["reservation-watches"],
    queryFn: fetchWatches,
    refetchInterval: 5000,
  });
  const activityQuery = useQuery({
    queryKey: ["reservation-activity"],
    queryFn: () => fetchActivity(),
    refetchInterval: 5000,
  });

  if (connectionsQuery.error || watchesQuery.error || activityQuery.error) {
    const error =
      connectionsQuery.error ?? watchesQuery.error ?? activityQuery.error;
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-destructive text-sm">
            {error instanceof Error
              ? error.message
              : "Failed to load reservations"}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-5 md:p-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl tracking-tight">Reservations</h1>
        <p className="text-muted-foreground text-sm">
          Connect Gmail and Resy, create a watch window, and track the full Resy
          Notify to claim loop.
        </p>
      </div>

      {connectionsQuery.data && (
        <ConnectionsSection connections={connectionsQuery.data} />
      )}
      <WatchForm />
      {watchesQuery.data && (
        <WatchesSection watches={watchesQuery.data.watches} />
      )}
      {activityQuery.data && (
        <ActivitySection events={activityQuery.data.events} />
      )}
    </div>
  );
}
