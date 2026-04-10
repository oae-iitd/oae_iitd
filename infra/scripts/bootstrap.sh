#!/usr/bin/env bash
# bootstrap.sh — one-time setup after Terraform apply
# Run: bash infra/scripts/bootstrap.sh <cluster-name> <aws-region>
set -euo pipefail

CLUSTER_NAME="${1:-oae-production}"
AWS_REGION="${2:-ap-south-1}"

echo "==> Updating kubeconfig for cluster: ${CLUSTER_NAME}"
aws eks update-kubeconfig --region "${AWS_REGION}" --name "${CLUSTER_NAME}"

# ── AWS Load Balancer Controller ────────────────────────────────────────────────
echo "==> Adding AWS EKS Helm repo"
helm repo add eks https://aws.github.io/eks-charts
helm repo update

# ── Install ArgoCD ──────────────────────────────────────────────────────────────
echo "==> Installing ArgoCD"
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd \
  --version "7.*" \
  -f infra/k8s/argocd/values.yaml \
  --wait

echo ""
echo "==> ArgoCD initial admin password:"
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo

# ── Bootstrap App-of-Apps ───────────────────────────────────────────────────────
echo ""
echo "==> IMPORTANT: Edit these files with your actual values before running the next step:"
echo "    infra/k8s/argocd/apps/root-app.yaml            - set your GitHub repo URL"
echo "    infra/k8s/argocd/apps/server.yaml              - set your GitHub repo URL"
echo "    infra/k8s/argocd/apps/external-secrets.yaml    - set IRSA role ARN"
echo "    infra/k8s/argocd/apps/aws-load-balancer-controller.yaml - set IRSA role ARN + VPC ID"
echo "    infra/k8s/manifests/server/overlays/production/ - set ECR URL, domain, ACM ARN"
echo ""
read -rp "Press Enter after editing the files to apply the root App-of-Apps..."

kubectl apply -f infra/k8s/argocd/apps/root-app.yaml

echo ""
echo "==> Bootstrap complete. ArgoCD will now sync all apps."
echo "    Monitor: kubectl -n argocd get applications"
