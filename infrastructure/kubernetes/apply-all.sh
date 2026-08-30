#!/usr/bin/env bash
# Apply every SentinelOps deployment + service to the cluster in one go.
# Run after load-images-into-cluster.ps1 (images must already be imported).
set -e
cd "$(dirname "$0")"

for f in payments-api-deployment.yaml orders-api-deployment.yaml auth-api-deployment.yaml notification-api-deployment.yaml services.yaml; do
  echo "Applying $f ..."
  kubectl apply -f "$f"
done

echo ""
echo "Done. Check status with:"
echo "  kubectl get pods"
echo "  kubectl get services"
