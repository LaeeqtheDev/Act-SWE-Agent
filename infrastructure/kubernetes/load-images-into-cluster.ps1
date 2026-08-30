# Docker Desktop's built-in Kubernetes (kind, containerd image store) does not
# automatically see images from `docker build`. This script reproduces the
# working fix from the original debugging session: save each image to a tar,
# copy it into the cluster's node container, and import it with containerd's
# CLI directly.
#
# Run this from the repo root any time you rebuild sentinelops-api:latest
# or sentinelops-web:latest and need Kubernetes to pick up the new version.

$ErrorActionPreference = "Stop"
$node = "desktop-control-plane"

function Import-Image($image, $tarName) {
    Write-Host "Saving $image ..."
    docker save $image -o $tarName
    Write-Host "Copying into $node ..."
    docker cp $tarName "${node}:/$tarName"
    Write-Host "Importing into containerd ..."
    docker exec $node sh -c "ctr -n=k8s.io images import /$tarName"
    Remove-Item $tarName -ErrorAction SilentlyContinue
}

Import-Image "sentinelops-api:latest" "sentinelops-api.tar"
Import-Image "sentinelops-web:latest" "sentinelops-web.tar"

Write-Host "Done. Restart deployments to pick up the new image, e.g.:"
Write-Host "  kubectl rollout restart deployment payments-api"
