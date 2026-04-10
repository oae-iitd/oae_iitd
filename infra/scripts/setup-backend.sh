#!/usr/bin/env bash
# setup-backend.sh — run ONCE with admin credentials before terraform init
# Creates the S3 bucket and DynamoDB table used for Terraform remote state.
set -euo pipefail

REGION="ap-south-1"
BUCKET="oae-tf-state-957905179934"
TABLE="oae-tf-locks"

echo "==> Creating Terraform state bucket: ${BUCKET}"
aws s3api create-bucket \
  --bucket "${BUCKET}" \
  --region "${REGION}" \
  --create-bucket-configuration LocationConstraint="${REGION}"

aws s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

aws s3api put-public-access-block \
  --bucket "${BUCKET}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "==> Creating DynamoDB lock table: ${TABLE}"
aws dynamodb create-table \
  --table-name "${TABLE}" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}"

echo ""
echo "Done. Now run: terraform init"
