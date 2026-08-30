import * as k8s from "@kubernetes/client-node";

// Best-effort Kubernetes client. In local dev, or when no cluster/kubeconfig
// is reachable, every function here degrades gracefully instead of crashing
// the API or the agent — the agent just gets told "cluster data unavailable"
// and falls back to database-only evidence.

let coreApi: k8s.CoreV1Api | null = null;
let appsApi: k8s.AppsV1Api | null = null;

function getClients() {
  if (coreApi && appsApi) return { coreApi, appsApi };
  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    coreApi = kc.makeApiClient(k8s.CoreV1Api);
    appsApi = kc.makeApiClient(k8s.AppsV1Api);
    return { coreApi, appsApi };
  } catch {
    return { coreApi: null, appsApi: null };
  }
}

export async function getPodStatus(serviceName: string) {
  const { coreApi } = getClients();
  if (!coreApi) return { available: false, reason: "no cluster reachable" };

  try {
    const res = await coreApi.listNamespacedPod({
      namespace: "default",
      labelSelector: `app=${serviceName}`,
    });
    const pods = res.items.map((p) => ({
      name: p.metadata?.name,
      phase: p.status?.phase,
      restartCount: p.status?.containerStatuses?.[0]?.restartCount ?? 0,
      ready: p.status?.containerStatuses?.[0]?.ready ?? false,
      startedAt: p.status?.startTime,
    }));
    return { available: true, pods };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : "unknown error" };
  }
}

export async function getRecentEvents(serviceName: string) {
  const { coreApi } = getClients();
  if (!coreApi) return { available: false, reason: "no cluster reachable" };

  try {
    const res = await coreApi.listNamespacedEvent({ namespace: "default" });
    const relevant = res.items
      .filter((e) => e.involvedObject?.name?.includes(serviceName))
      .slice(-10)
      .map((e) => ({
        reason: e.reason,
        message: e.message,
        type: e.type,
        lastTimestamp: e.lastTimestamp,
      }));
    return { available: true, events: relevant };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : "unknown error" };
  }
}

export async function getDeploymentStatus(serviceName: string) {
  const { appsApi } = getClients();
  if (!appsApi) return { available: false, reason: "no cluster reachable" };

  try {
    const res = await appsApi.readNamespacedDeployment({ name: serviceName, namespace: "default" });
    return {
      available: true,
      replicas: res.spec?.replicas,
      readyReplicas: res.status?.readyReplicas ?? 0,
      updatedReplicas: res.status?.updatedReplicas ?? 0,
      image: res.spec?.template.spec?.containers?.[0]?.image,
    };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : "unknown error" };
  }
}

export async function restartDeployment(serviceName: string) {
  const { appsApi } = getClients();
  if (!appsApi) return { success: false, reason: "no cluster reachable" };

  try {
    const patch = {
      spec: {
        template: {
          metadata: {
            annotations: {
              "sentinelops/restartedAt": new Date().toISOString(),
            },
          },
        },
      },
    };
    await appsApi.patchNamespacedDeployment(
      { name: serviceName, namespace: "default", body: patch },
      k8s.setHeaderOptions("Content-Type", "application/strategic-merge-patch+json")
    );
    return { success: true };
  } catch (err) {
    return { success: false, reason: err instanceof Error ? err.message : "unknown error" };
  }
}
