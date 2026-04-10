#!/usr/bin/env bash
# setup-github-role.sh — run ONCE with admin credentials BEFORE terraform can run.
# This breaks the chicken-and-egg: Terraform creates the GitHub Actions IAM role,
# but needs that role to exist first. We create it manually here, then Terraform
# imports and manages it going forward.
#
# Usage: bash infra/scripts/setup-github-role.sh
set -euo pipefail

ACCOUNT_ID="957905179934"
GITHUB_ORG="oae-iitd"
GITHUB_REPO="oae_iitd"
ROLE_NAME="oae-production-github-actions"
OIDC_PROVIDER_URL="token.actions.githubusercontent.com"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_PROVIDER_URL}"

echo "==> Step 1: Create GitHub OIDC provider"
aws iam create-open-id-connect-provider \
  --url "https://${OIDC_PROVIDER_URL}" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list \
    "6938fd4d98bab03faadb97b34396831e3780aea1" \
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd" \
  2>/dev/null && echo "  Created." || echo "  Already exists, skipping."

echo ""
echo "==> Step 2: Create IAM role: ${ROLE_NAME}"
aws iam create-role \
  --role-name "${ROLE_NAME}" \
  --assume-role-policy-document "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "${OIDC_ARN}" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:*"
      },
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      }
    }
  }]
}
EOF
)" 2>/dev/null && echo "  Created." || echo "  Already exists, skipping."

echo ""
echo "==> Step 3: Attach AdministratorAccess (scoped to this repo via OIDC trust)"
aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess"
echo "  Done."

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo ""
echo "============================================================"
echo "  Role ARN (set as GitHub Secret AWS_DEPLOY_ROLE_ARN):"
echo "  ${ROLE_ARN}"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Set GitHub Secret AWS_DEPLOY_ROLE_ARN = ${ROLE_ARN}"
echo "  2. Run: bash infra/scripts/setup-backend.sh"
echo "  3. Push infra/terraform changes to main → terraform.yml will apply"
echo "  4. After first terraform apply, import the role so Terraform manages it:"
echo "     terraform import aws_iam_role.github_actions ${ROLE_NAME}"
echo "     terraform import aws_iam_openid_connect_provider.github ${OIDC_ARN}"
