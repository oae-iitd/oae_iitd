#!/usr/bin/env bash
# bootstrap.sh — run ONCE after terraform apply to install ArgoCD and bootstrap the cluster.
# Usage: bash infra/scripts/bootstrap.sh
set -euo pipefail

CLUSTER_NAME="oae-production"
AWS_REGION="ap-south-1"
NAMESPACE_ARGOCD="argocd"

echo "==> Connecting kubectl to cluster: ${CLUSTER_NAME}"
aws eks update-kubeconfig --region "${AWS_REGION}" --name "${CLUSTER_NAME}"

# ── Helm repos ──────────────────────────────────────────────────────────────────
echo "==> Adding Helm repos"
helm repo add argo     https://argoproj.github.io/argo-helm
helm repo add eks      https://aws.github.io/eks-charts
helm repo update

# ── ArgoCD ─────────────────────────────────────────────────────────────────────
echo "==> Installing ArgoCD"
kubectl create namespace "${NAMESPACE_ARGOCD}" --dry-run=client -o yaml | kubectl apply -f -

# values.yaml must have the correct certificate-arn before this runs
helm upgrade --install argocd argo/argo-cd \
  --namespace "${NAMESPACE_ARGOCD}" \
  --version "7.*" \
  -f infra/k8s/argocd/values.yaml \
  --wait --timeout 5m

echo ""
echo "==> ArgoCD admin password:"
kubectl -n "${NAMESPACE_ARGOCD}" get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
echo ""

# ── Verify all ArgoCD app files are updated ────────────────────────────────────
echo ""
echo "==> Checklist — confirm these are set before continuing:"
echo "    [ ] infra/k8s/argocd/values.yaml             — certificate-arn (no CERTIFICATE_ID)"
echo "    [ ] infra/k8s/argocd/apps/*.yaml              — no ACCOUNT_ID placeholders"
echo "    [ ] infra/k8s/manifests/*/overlays/production — certificate-arn (no CERTIFICATE_ID)"
echo "    [ ] GitHub Secret AWS_DEPLOY_ROLE_ARN          — set to terraform output github_actions_role_arn"
echo ""
read -rp "All good? Press Enter to apply the root App-of-Apps (ArgoCD takes over from here)..."

# ── Bootstrap App-of-Apps ───────────────────────────────────────────────────────
kubectl apply -f infra/k8s/argocd/apps/root-app.yaml

echo ""
echo "==> Done! ArgoCD is now syncing all apps."
echo "    Watch:   kubectl -n argocd get applications -w"
echo "    ArgoCD:  https://argocd.anyserver.site  (admin / password above)"
